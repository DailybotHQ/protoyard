import { hashString } from '@protoyard/core';
import {
  type Blueprint,
  type BlueprintInput,
  type BlueprintScreenInput,
  parseBlueprint,
} from '../schema.ts';
import {
  ARCHETYPES,
  type Archetype,
  type EntityInput,
  type FieldInput,
  GENERIC_ARCHETYPE,
} from './archetypes.ts';
import { fieldFromPhrase, GLOBAL_CUES } from './fields.ts';
import { hasPhrase, normalize, plural, singular, titleCase, words } from './text.ts';

/**
 * Brief → blueprint, offline and deterministic: the same brief (and options)
 * always gives the same blueprint, with no network, model or randomness.
 * It picks an archetype by keywords, adds entities for nouns the brief asks
 * to track, infers field kinds from cue words, and derives screens from the
 * resulting data. The result is a valid starting point, not a final design:
 * the rationale says what was inferred so a person or agent can refine it.
 */

export interface BriefOptions {
  /** Force an archetype id (see `ARCHETYPE_IDS`) instead of keyword scoring. */
  archetype?: string;
  /** Product name; default: a fictional name derived from the brief. */
  name?: string;
}

export type SuggestedLayout = 'sidebar' | 'mobile-tabs';

export interface BriefResult {
  /** Parsed and validated. */
  blueprint: Blueprint;
  /** The same blueprint as plain JSON, ready to write as `blueprint.json`. */
  json: BlueprintInput;
  archetype: string;
  /** App layout the brief suggests (phone briefs → bottom tabs). */
  layout: SuggestedLayout;
  /** One line per inference, in order. */
  rationale: string[];
}

/** Longer briefs are cut here; the synthesizer reads keywords, not essays. */
export const MAX_BRIEF_LENGTH = 5_000;
const MAX_EXTRA_ENTITIES = 4;
const MAX_CLAUSE_FIELDS = 8;

const CLAUSE =
  /\b(?:track|tracks|tracking|manage|manages|managing|log|logs|logging|record|records|organize|organizes|monitor|monitors|catalog|catalogs|list|lists|sell|sells|store|stores|handle|handles|follow|follows|keep|keeps|collect|collects|schedule|schedules|share|shares|review|reviews)\s+([^.;:!?\n]+)/g;
const FIELD_SPLIT = /\b(?:with|including|having)\b/;
const NOUN_END =
  /\b(?:for|from|in|on|by|so|to|across|at|via|using|where|when|who|which|that|while|per|into)\b/;
const ITEM_SPLIT = /,|\band\b|\bor\b|&|\//;

/** Nouns that never become entities. */
const STOP_NOUNS = new Set([
  'track',
  'time',
  'data',
  'thing',
  'stuff',
  'everything',
  'anything',
  'them',
  'it',
  'work',
  'team',
  'progress',
  'status',
  'info',
  'information',
  'detail',
  'money',
  'way',
  'lot',
  'day',
  'week',
  'month',
  'year',
  'one',
  'all',
  'more',
  'app',
  'tool',
  'system',
  'platform',
  'business',
  'company',
  'people',
  'person',
  'user',
  'customer',
  'their',
  'our',
  'your',
  'who',
  'what',
]);
const DETERMINERS = new Set([
  'the',
  'a',
  'an',
  'their',
  'our',
  'your',
  'all',
  'each',
  'every',
  'new',
  'of',
  'its',
  'any',
  'some',
  'many',
]);

/** Fictional product words for generated names. */
const NAME_WORDS = [
  'Harbor',
  'Lumen',
  'Cedar',
  'Beacon',
  'Juniper',
  'Copper',
  'Willow',
  'Lantern',
  'Meadow',
  'Summit',
  'Quarry',
  'Tidal',
  'Ember',
  'Orchard',
  'Kestrel',
  'Maple',
] as const;

/** Brand seeds already shipped (and AA-checked) by the blueprint catalog. */
const BRANDS = [
  { seed: '#0284c7', styleProfile: 'soft', font: 'humanist' },
  { seed: '#059669', styleProfile: 'soft', font: 'humanist' },
  { seed: '#0f766e', styleProfile: 'flat', font: 'system' },
  { seed: '#15803d', styleProfile: 'crisp', font: 'grotesk' },
  { seed: '#1d4ed8', styleProfile: 'rounded', font: 'humanist' },
  { seed: '#1e3a8a', styleProfile: 'crisp', font: 'grotesk' },
  { seed: '#334155', styleProfile: 'flat', font: 'system' },
  { seed: '#4338ca', styleProfile: 'mono', font: 'mono' },
  { seed: '#4f46e5', styleProfile: 'crisp', font: 'mono' },
  { seed: '#6b21a8', styleProfile: 'editorial', font: 'editorial' },
  { seed: '#7c3aed', styleProfile: 'crisp', font: 'humanist' },
  { seed: '#b45309', styleProfile: 'flat', font: 'system' },
  { seed: '#be123c', styleProfile: 'soft', font: 'humanist' },
  { seed: '#c2410c', styleProfile: 'rounded', font: 'rounded' },
  { seed: '#db2777', styleProfile: 'rounded', font: 'geometric' },
  { seed: '#0891b2', styleProfile: 'soft', font: 'system' },
] as const;

const MOBILE_CUES = ['mobile', 'phone app', 'ios', 'android', 'on the go', 'smartphone'];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function chooseArchetype(
  normalized: string,
  forced: string | undefined
): { archetype: Archetype; matched: string[] } {
  if (forced !== undefined) {
    const found = [...ARCHETYPES, GENERIC_ARCHETYPE].find((a) => a.id === forced);
    if (!found) throw new RangeError(`blueprintFromBrief(): unknown archetype "${forced}"`);
    return { archetype: found, matched: [] };
  }
  let best: { archetype: Archetype; matched: string[] } = {
    archetype: GENERIC_ARCHETYPE,
    matched: [],
  };
  for (const archetype of ARCHETYPES) {
    const matched = archetype.keywords.filter((k) => hasPhrase(normalized, k));
    // One stray word ("health", "book") is not enough, unless it names one of
    // the archetype's own entities ("tickets", "shipments").
    const names = archetype.entities.flatMap((e) => [e.name, e.plural]);
    const strong = matched.length >= 2 || matched.some((k) => names.includes(k));
    if (strong && matched.length > best.matched.length) best = { archetype, matched };
  }
  return best;
}

/** `"track invoices and vendors with amount and due date"` → nouns and field phrases. */
function clauses(brief: string): { nouns: string[]; fields: string[] }[] {
  const found: { nouns: string[]; fields: string[] }[] = [];
  for (const match of brief.toLowerCase().matchAll(CLAUSE)) {
    let body = (match[1] ?? '').replace(/^(?:track|note)\s+of\s+/, '').replace(/^of\s+/, '');
    const [nounPart = '', fieldPart = ''] = body.split(FIELD_SPLIT, 2);
    body = nounPart.split(NOUN_END)[0] ?? '';
    const nouns = body
      .split(ITEM_SPLIT)
      // "inspections of building sites" → "inspections": the head noun comes before "of".
      .map((item) => words(item.split(/\bof\b/)[0] ?? '').filter((w) => !DETERMINERS.has(w)))
      .filter((ws) => ws.length > 0)
      .map((ws) => singular(ws.at(-1) as string))
      .filter((noun) => noun.length >= 3 && !STOP_NOUNS.has(noun))
      // Attribute words ("locations", "prices", "deadlines") are fields, not entities.
      .filter((noun) => fieldFromPhrase(noun)?.field.kind === 'text');
    const fields = fieldPart
      .split(NOUN_END)[0]
      ?.split(ITEM_SPLIT)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_CLAUSE_FIELDS);
    if (nouns.length > 0) found.push({ nouns, fields: fields ?? [] });
  }
  return found;
}

function addField(entity: EntityInput, field: FieldInput): boolean {
  if (entity.fields.some((f) => f.name === field.name)) return false;
  entity.fields.push(field);
  return true;
}

const kindOf = (field: FieldInput) => field.kind as string;
const isEnum = (f: FieldInput): f is FieldInput & { kind: 'enum'; values: string[] } =>
  f.kind === 'enum';
const isDate = (f: FieldInput) => f.kind === 'date' || f.kind === 'datetime';
const windowOf = (f: FieldInput) => (f as { window?: unknown }).window;

function boardField(entity: EntityInput): string | null {
  const enums = entity.fields.filter(isEnum);
  return (
    enums.find((f) => ['status', 'stage', 'state'].includes(f.name))?.name ?? enums[0]?.name ?? null
  );
}

function screensFor(entities: EntityInput[], focus: EntityInput): BlueprintScreenInput[] {
  const screens: BlueprintScreenInput[] = [];
  const label = (e: EntityInput) => titleCase(e.plural.replace(/-/g, ' '));

  const dashboard: BlueprintScreenInput & { type: 'dashboard' } = {
    type: 'dashboard',
    path: '/',
    title: 'Overview',
    widgets: entities.slice(0, 3).map((e) => ({ kind: 'kpi', label: label(e), entity: e.name })),
  };
  const money = entities
    .flatMap((e) => e.fields.map((f) => ({ e, f })))
    .find(({ f }) => f.kind === 'money');
  if (money) {
    dashboard.widgets?.push({
      kind: 'kpi',
      label: `Total ${titleCase(money.f.name.replace(/([A-Z])/g, ' $1').toLowerCase())}`.slice(
        0,
        60
      ),
      entity: money.e.name,
      aggregate: 'sum',
      field: money.f.name,
    });
  }
  const focusBoard = boardField(focus);
  if (focusBoard) {
    dashboard.widgets?.push({
      kind: 'chart',
      label: `${label(focus)} by ${focusBoard}`.slice(0, 60),
      entity: focus.name,
      chart: 'donut',
      groupBy: focusBoard,
    });
  }
  dashboard.widgets?.push({
    kind: 'chart',
    label: `New ${label(focus).toLowerCase()} per week`.slice(0, 60),
    entity: focus.name,
    chart: 'line',
    bucket: { field: 'createdAt', unit: 'week' },
    span: 2,
  });
  screens.push(dashboard);

  for (const entity of entities) {
    const isFocus = entity === focus;
    screens.push({ type: 'list', entity: entity.name });
    const group = boardField(entity);
    const statusLike = entity.fields.some(
      (f) => isEnum(f) && ['status', 'stage', 'state'].includes(f.name)
    );
    if (group && (isFocus || statusLike)) {
      screens.push({ type: 'board', entity: entity.name, groupBy: group });
    }
    const dates = entity.fields.filter(isDate);
    const start = dates.find((f) => /^(start|begin|depart)/.test(f.name));
    const end = dates.find((f) => f !== start && /^(end|finish|arrive|due)/.test(f.name));
    if (start && end && kindOf(start) === kindOf(end)) {
      screens.push({
        type: 'timeline',
        entity: entity.name,
        startField: start.name,
        endField: end.name,
        ...(group ? { groupBy: group } : {}),
      });
    }
    const upcoming = dates.find((f) => windowOf(f) !== undefined && windowOf(f) !== 'past');
    if (upcoming) {
      screens.push({
        type: 'calendar',
        entity: entity.name,
        dateField: upcoming.name,
        ...(start && end && upcoming === start && kindOf(start) === kindOf(end)
          ? { endField: end.name }
          : {}),
        ...(group ? { colorBy: group } : {}),
      });
    }
    const geo = entity.fields.find((f) => f.kind === 'geo');
    if (geo) {
      screens.push({
        type: 'map',
        entity: entity.name,
        geoField: geo.name,
        ...(group ? { colorBy: group } : {}),
      });
    }
  }

  const measured = entities.find((e) =>
    e.fields.some((f) => ['money', 'number', 'integer'].includes(f.kind))
  );
  if (measured) {
    const numeric = measured.fields.find((f) => ['money', 'number', 'integer'].includes(f.kind));
    screens.push({
      type: 'analytics',
      entity: measured.name,
      dateField: 'createdAt',
      measures: [
        { label: 'Count' },
        {
          label: `${numeric?.kind === 'money' ? 'Total' : 'Average'} ${numeric?.name}`.slice(0, 60),
          aggregate: numeric?.kind === 'money' ? 'sum' : 'avg',
          field: numeric?.name,
        },
      ],
      dimensions: measured.fields
        .filter((f) => ['enum', 'persona', 'relation', 'boolean'].includes(f.kind))
        .filter(
          (f) => f.kind !== 'relation' || (f as { cardinality?: string }).cardinality !== 'many'
        )
        .slice(0, 3)
        .map((f) => f.name),
    });
  }

  const related = entities.filter(
    (e) =>
      e !== focus &&
      e.fields.some((f) => f.kind === 'relation' && (f as { to?: string }).to === focus.name)
  );
  screens.push({
    type: 'detail',
    entity: focus.name,
    tabs: ['overview', 'activity', ...related.map((e) => `related:${e.name}`)],
  });
  screens.push({ type: 'settings', sections: ['profile', 'workspace', 'appearance', 'danger'] });
  return screens;
}

/** A valid blueprint from a short product brief, plus the reasons for each choice. */
export function blueprintFromBrief(brief: string, options: BriefOptions = {}): BriefResult {
  const source = brief.slice(0, MAX_BRIEF_LENGTH);
  const normalized = normalize(source);
  const rationale: string[] = [];

  const { archetype, matched } = chooseArchetype(normalized, options.archetype);
  rationale.push(
    options.archetype !== undefined
      ? `Archetype ${archetype.id} (chosen explicitly).`
      : matched.length > 0
        ? `Archetype ${archetype.id}: matched ${matched.join(', ')}.`
        : `Archetype ${archetype.id}: no archetype keyword matched, so a plain tracker.`
  );

  const entities: EntityInput[] = clone([...archetype.entities]);
  let focus = entities[0] as EntityInput;
  const byNoun = (noun: string) =>
    entities.find((e) => e.name === noun || e.plural === plural(noun) || e.name === singular(noun));

  // Nouns the brief asks to track become entities (or extend existing ones).
  let added = 0;
  for (const clause of clauses(source)) {
    let target: EntityInput | undefined;
    for (const noun of clause.nouns) {
      let entity = byNoun(noun);
      if (!entity && archetype === GENERIC_ARCHETYPE && focus.name === 'item' && added === 0) {
        focus.name = noun;
        focus.plural = plural(noun);
        entity = focus;
        rationale.push(`Main entity ${noun} from "${clause.nouns.join(', ')}".`);
        added++;
      } else if (!entity && added < MAX_EXTRA_ENTITIES && /^[a-z]{3,30}$/.test(noun)) {
        entity = {
          name: noun,
          plural: plural(noun),
          fields: [
            {
              name: 'name',
              kind: 'text',
              required: true,
              fake: 'commerce.productName',
            } as FieldInput,
            {
              name: focus.name,
              kind: 'relation',
              to: focus.name,
              onDelete: 'nullify',
            } as FieldInput,
          ],
          titleField: 'name',
        };
        entities.push(entity);
        added++;
        rationale.push(
          `Entity ${noun} from "${clause.nouns.join(', ')}", linked to ${focus.name}.`
        );
      }
      if (entity) target = entity;
    }
    if (!target) continue;
    for (const phrase of clause.fields) {
      const inferred = fieldFromPhrase(phrase);
      if (!inferred) continue;
      if (addField(target, inferred.field)) {
        rationale.push(
          `Field ${target.name}.${inferred.field.name} (${inferred.field.kind}) from "${phrase}"${
            inferred.cue ? ` (cue "${inferred.cue}")` : ''
          }.`
        );
      }
    }
  }

  // Brief-wide cues land on the focus entity when it lacks that kind of field.
  for (const cue of GLOBAL_CUES) {
    const hit = cue.cues.find((c) => hasPhrase(normalized, c));
    const same = (f: FieldInput) => kindOf(f) === cue.kind || (cue.kind === 'date' && isDate(f));
    if (!hit || focus.fields.some(same)) continue;
    if (addField(focus, clone(cue.field))) {
      rationale.push(`Field ${focus.name}.${cue.field.name} (${cue.kind}) from "${hit}".`);
    }
  }
  focus = entities[0] as EntityInput;
  focus.features = { softDelete: true, audit: true, csv: true };
  for (const entity of entities.slice(1)) entity.features = { csv: true };

  const screens = screensFor(entities, focus);
  rationale.push(
    `Screens: ${[...new Set(screens.map((s) => s.type))].join(', ')} (from enums, dates, locations and amounts).`
  );

  const name = (
    options.name?.trim() ||
    `${NAME_WORDS[hashString(normalized || archetype.id) % NAME_WORDS.length]} ${archetype.label}`
  ).slice(0, 80);
  const brand = BRANDS[hashString(name) % BRANDS.length] as (typeof BRANDS)[number];
  const sentence =
    source
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s/)[0] ?? '';
  const description = (sentence || `${archetype.label} prototype.`).slice(0, 280);
  const layout: SuggestedLayout = MOBILE_CUES.some((c) => hasPhrase(normalized, c))
    ? 'mobile-tabs'
    : 'sidebar';
  rationale.push(`Layout ${layout}; brand seed ${brand.seed} (${brand.styleProfile}).`);

  const member: Record<string, string[]> = {};
  for (const entity of entities) {
    member[entity.name] = [
      'read',
      'create',
      'update',
      ...(entity.ownerField ? ['delete:own'] : []),
    ];
  }

  const json: BlueprintInput = {
    formatVersion: 1,
    name,
    description,
    tags: [archetype.id],
    brand: {
      name: name.slice(0, 40),
      seed: brand.seed,
      styleProfile: brand.styleProfile,
      font: brand.font,
    },
    entities,
    roles: [
      { name: 'owner', label: 'Owner', permissions: { '*': ['*'] } },
      { name: 'admin', label: 'Admin', permissions: { '*': ['*'] } },
      { name: 'member', label: 'Member', permissions: member },
      { name: 'viewer', label: 'Viewer', permissions: { '*': ['read'] } },
    ],
    screens,
  };

  return {
    blueprint: parseBlueprint(json),
    json,
    archetype: archetype.id,
    layout,
    rationale,
  };
}
