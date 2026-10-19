import { type GenerateContext, hashString, type Row, type WorldSeed } from '@protoyard/core';
import {
  createAvatarPool,
  GENERATOR_SDK_VERSION,
  type GeoRegionId,
  generateTeam,
  geoPoints,
  type Seasonality,
  timeSeries,
} from '@protoyard/scenarios';
import type { Blueprint, BlueprintEntity, BlueprintField } from './schema.ts';
import { dateWindowDays, entityTable } from './schema.ts';
import { FEATURE_TABLES } from './storage.ts';
import { inputProperty } from './validation.ts';

/**
 * Deterministic world generator for a blueprint. Import from
 * `@protoyard/blueprint/generator` (lazy) so Faker never enters the initial chunk.
 *
 * Determinism only: ctx.rng, ctx.faker, ctx.ids, ctx.time (no ambient clocks or PRNGs).
 */

/** Bump when the same blueprint + seed can produce a different world shape. */
export const BLUEPRINT_GENERATOR_SDK = 5;

/** Region for geo fields that do not name one. */
export const DEFAULT_GEO_REGION: GeoRegionId = 'metro-grid';

/** Faker paths blueprints may name in `field.fake` (everything else is ignored). */
export const ALLOWED_FAKE_PATHS = [
  'company.name',
  'company.catchPhrase',
  'person.fullName',
  'person.firstName',
  'person.lastName',
  'person.jobTitle',
  'lorem.sentence',
  'lorem.paragraph',
  'lorem.words',
  'internet.email',
  'internet.url',
  'internet.username',
  'phone.number',
  'commerce.productName',
  'location.city',
  'location.country',
  'location.streetAddress',
  'commerce.department',
  'company.buzzPhrase',
  'word.words',
] as const;

export type AllowedFakePath = (typeof ALLOWED_FAKE_PATHS)[number];

const ALLOWED = new Set<string>(ALLOWED_FAKE_PATHS);
const EXAMPLE_DOMAINS = ['example.com', 'example.org'] as const;

export interface BlueprintGenerator {
  /** Builds a WorldSeed for the scenario context. */
  generate(ctx: GenerateContext): WorldSeed;
  /**
   * Trace id for ActiveScenarioInfo: mixes blueprint content hash with the
   * blueprint generator SDK and the scenarios package SDK version.
   */
  readonly generatorVersion: number;
}

/** Stable hash of a blueprint's generative surface (entities, fields, features). */
export function hashBlueprint(blueprint: Blueprint): number {
  const payload = {
    name: blueprint.name,
    entities: blueprint.entities.map((entity) => ({
      name: entity.name,
      plural: entity.plural,
      table: entity.table ?? null,
      titleField: entity.titleField,
      ownerField: entity.ownerField ?? null,
      seedCount: entity.seedCount ?? null,
      features: entity.features,
      fields: entity.fields.map((field) => ({
        name: field.name,
        kind: field.kind,
        required: field.required,
        fake: 'fake' in field ? (field.fake ?? null) : null,
        ...('values' in field ? { values: field.values } : {}),
        ...('min' in field ? { min: field.min ?? null, max: field.max ?? null } : {}),
        ...('minLength' in field
          ? { minLength: field.minLength ?? null, maxLength: field.maxLength ?? null }
          : {}),
        ...('cardinality' in field ? { to: field.to, cardinality: field.cardinality } : {}),
        ...(field.kind === 'geo' ? { region: field.region ?? null } : {}),
        ...('weights' in field ? { weights: field.weights ?? null } : {}),
        ...('window' in field ? { window: field.window ?? null } : {}),
        ...('trend' in field ? { trend: field.trend ?? null } : {}),
        ...('default' in field ? { default: field.default ?? null } : {}),
      })),
    })),
  };
  return hashString(JSON.stringify(payload));
}

export function blueprintGeneratorVersion(blueprint: Blueprint): number {
  return (
    (hashBlueprint(blueprint) ^
      ((BLUEPRINT_GENERATOR_SDK * 1_000_003) >>> 0) ^
      ((GENERATOR_SDK_VERSION * 97) >>> 0)) >>>
    0
  );
}

/**
 * Entity order so relation targets are generated before dependents.
 * Cycles fall back to declaration order for the remaining nodes.
 */
export function topologicalEntities(blueprint: Blueprint): BlueprintEntity[] {
  const byName = new Map(blueprint.entities.map((e) => [e.name, e]));
  const deps = new Map<string, Set<string>>();
  for (const entity of blueprint.entities) {
    const need = new Set<string>();
    for (const field of entity.fields) {
      if (field.kind === 'relation' && byName.has(field.to) && field.to !== entity.name) {
        need.add(field.to);
      }
    }
    deps.set(entity.name, need);
  }
  const remaining = new Set(blueprint.entities.map((e) => e.name));
  const ordered: BlueprintEntity[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((name) =>
      [...(deps.get(name) ?? [])].every((d) => !remaining.has(d))
    );
    const batch = ready.length > 0 ? ready : [[...remaining][0] as string];
    // Stable: keep declaration order within each batch.
    const sorted = blueprint.entities.map((e) => e.name).filter((name) => batch.includes(name));
    for (const name of sorted) {
      remaining.delete(name);
      ordered.push(byName.get(name) as BlueprintEntity);
    }
  }
  return ordered;
}

function baseCountFor(entity: BlueprintEntity, blueprint: Blueprint): number {
  // Roots (nothing points at them less) get a smaller base; dependents a larger one.
  const incoming = blueprint.entities.some((other) =>
    other.fields.some((f) => f.kind === 'relation' && f.to === entity.name)
  );
  return incoming ? 8 : 4;
}

function callFake(faker: GenerateContext['faker'], path: string): unknown {
  if (!ALLOWED.has(path)) return undefined;
  const [mod, method] = path.split('.') as [string, string];
  const namespace = (faker as unknown as Record<string, Record<string, unknown>>)[mod];
  const fn = namespace?.[method];
  if (typeof fn !== 'function') return undefined;
  return (fn as () => unknown).call(namespace);
}

function emailFrom(faker: GenerateContext['faker'], rng: GenerateContext['rng']): string {
  const local =
    String(faker.internet.username())
      .toLowerCase()
      .replace(/[^a-z0-9._+-]/g, '')
      .slice(0, 24) || 'user';
  const domain = rng.pick([...EXAMPLE_DOMAINS]);
  return `${local}@${domain}`;
}

const MS_PER_DAY = 86_400_000;

/**
 * An instant inside a date field's window: a uniform day, then business hours
 * (09:00–17:00 UTC, quarter hours) for datetimes and noon for dates. Never
 * before the organization started; after now only when the window says so.
 */
function windowInstant(
  field: Extract<BlueprintField, { kind: 'date' | 'datetime' }>,
  ctx: GenerateContext,
  orgStart: Date
): number {
  const { from, to } = dateWindowDays(field.window);
  const now = ctx.time.now.getTime();
  const floor = orgStart.getTime();
  const lo = from === null ? floor : Math.max(floor, now + from * MS_PER_DAY);
  const hi = Math.max(lo, now + to * MS_PER_DAY);
  const day = Math.floor((lo + ctx.rng.next() * (hi - lo)) / MS_PER_DAY) * MS_PER_DAY;
  const minutes =
    field.kind === 'date'
      ? 12 * 60
      : ctx.rng.int(9, 16) * 60 + ctx.rng.pick([0, 15, 30, 45] as const);
  return Math.min(hi, Math.max(lo, day + minutes * 60_000));
}

const TREND_RATES = { flat: 0, growth: 0.2, decline: -0.12, seasonal: 0 } as const;

type TrendField = Extract<BlueprintField, { kind: 'number' | 'integer' | 'money' }>;

/**
 * Daily values for a trended field from the organization start to now, built
 * with `timeSeries` (level at now = middle of the field's range). A row takes
 * the value of its `createdAt` day, so charts over createdAt show the trend.
 */
function trendByDay(
  field: TrendField,
  entity: BlueprintEntity,
  ctx: GenerateContext,
  orgCreatedAt: string
): Map<string, number> {
  const lo = field.min ?? 0;
  const hi = field.max ?? (field.kind === 'money' ? 100_000 : lo + 100);
  const days = Math.max(
    1,
    Math.ceil((ctx.time.now.getTime() - Date.parse(orgCreatedAt)) / MS_PER_DAY) + 1
  );
  const seasonality: Seasonality = field.trend === 'seasonal' ? 'weekly+annual' : 'none';
  const points = timeSeries({
    ctx,
    key: `blueprint:${entity.name}.${field.name}`,
    days,
    base: (lo + hi) / 2,
    trend: TREND_RATES[field.trend ?? 'flat'],
    seasonality,
    noise: 0.08,
    min: lo,
    max: hi,
    integer: field.kind !== 'number',
  });
  return new Map(points.map((p) => [p.at.slice(0, 10), p.value]));
}

function valueForField(
  field: BlueprintField,
  ctx: GenerateContext,
  personas: readonly { id: string }[],
  tables: Record<string, Row[]>,
  byName: Map<string, BlueprintEntity>,
  orgCreatedAt: string
): unknown {
  const { faker, rng, time } = ctx;
  const orgStart = new Date(orgCreatedAt);

  // Faces are dealt per entity field from a seeded pool (see createBlueprintGenerator).
  if (field.kind === 'avatar') return null;

  if ('default' in field && field.default !== undefined && !field.required && rng.chance(0.15)) {
    return field.default;
  }

  if (field.fake) {
    const hinted = callFake(faker, field.fake);
    if (hinted !== undefined) {
      if (field.kind === 'email') return emailFrom(faker, rng);
      if (typeof hinted === 'string') {
        let text = hinted;
        if ('maxLength' in field && typeof field.maxLength === 'number') {
          text = text.slice(0, field.maxLength);
        }
        if (
          'minLength' in field &&
          typeof field.minLength === 'number' &&
          text.length < field.minLength
        ) {
          text = (text + ' example').slice(0, Math.max(field.minLength, text.length));
        }
        return text;
      }
      return hinted;
    }
  }

  switch (field.kind) {
    case 'text': {
      let text = String(faker.lorem.words(rng.int(2, 4)));
      if (field.maxLength) text = text.slice(0, field.maxLength);
      if (field.minLength && text.length < field.minLength) {
        text = `${text} ${'x'.repeat(field.minLength)}`.slice(0, field.minLength);
      }
      return text;
    }
    case 'longText':
      return String(faker.lorem.paragraph()).slice(0, field.maxLength ?? 500);
    case 'number': {
      const min = field.min ?? 0;
      const max = field.max ?? min + 100;
      return rng.float(min, max === min ? min + 1 : max);
    }
    case 'integer': {
      const min = field.min ?? 0;
      const max = field.max ?? min + 100;
      return rng.int(min, max);
    }
    case 'money': {
      const min = field.min ?? 0;
      const max = field.max ?? 100_000;
      return rng.int(min, max);
    }
    case 'boolean':
      return rng.chance(0.5);
    case 'date':
    case 'datetime': {
      // Integrity compares parsed instants to org.createdAt. Date-only
      // `YYYY-MM-DD` is UTC midnight and can fall before org.createdAt on the
      // same calendar day, so both kinds store full ISO instants ≥ org start.
      if (field.window === undefined) {
        const d = time.between(orgStart, time.now, rng.next);
        const ms = Math.max(d.getTime(), orgStart.getTime());
        return new Date(ms).toISOString();
      }
      return new Date(windowInstant(field, ctx, orgStart)).toISOString();
    }
    case 'enum':
      return field.weights
        ? rng.weighted(field.values.map((value, i) => [value, field.weights?.[i] ?? 0] as const))
        : rng.pick(field.values);
    case 'email':
      return emailFrom(faker, rng);
    case 'url':
      return `https://${rng.pick([...EXAMPLE_DOMAINS])}/${faker.internet.username().toLowerCase()}`;
    case 'phone':
      return `+1-555-${String(rng.int(100, 999))}-${String(rng.int(1000, 9999))}`;
    case 'tags': {
      const n = rng.int(0, Math.min(3, field.maxItems ?? 8));
      const tags = new Set<string>();
      while (tags.size < n) tags.add(faker.lorem.word().toLowerCase());
      return [...tags];
    }
    case 'relation': {
      const target = byName.get(field.to);
      if (!target) return field.cardinality === 'many' ? [] : null;
      const pool = tables[entityTable(target)] ?? [];
      if (pool.length === 0) return field.cardinality === 'many' ? [] : null;
      if (field.cardinality === 'many') {
        const count = rng.int(0, Math.min(3, pool.length));
        return rng.sample(
          pool.map((r) => r.id),
          count
        );
      }
      if (field.required) return rng.pick(pool).id;
      return rng.chance(0.85) ? rng.pick(pool).id : null;
    }
    case 'persona':
      if (personas.length === 0) return null;
      return field.required || rng.chance(0.9) ? rng.pick([...personas]).id : null;
    case 'file':
      return field.multiple ? [] : null;
    case 'json':
      return { note: String(faker.lorem.words(2)) };
    default:
      return null;
  }
}

function stampRow(
  ctx: GenerateContext,
  orgCreatedAt: string
): { createdAt: string; updatedAt: string } {
  const start = new Date(orgCreatedAt);
  const createdAt = ctx.time.between(start, ctx.time.now, ctx.rng.next).toISOString();
  const createdMs = Date.parse(createdAt);
  const updatedAt =
    createdMs >= ctx.time.now.getTime()
      ? createdAt
      : ctx.time.between(new Date(createdMs), ctx.time.now, ctx.rng.next).toISOString();
  return { createdAt, updatedAt };
}

function seedAuditHistory(
  ctx: GenerateContext,
  blueprint: Blueprint,
  tables: Record<string, Row[]>,
  personas: readonly { id: string }[]
): Row[] {
  if (personas.length === 0) return [];
  const audited = blueprint.entities.filter((e) => e.features.audit);
  if (audited.length === 0) return [];
  const rng = ctx.rng.fork('blueprint:audit-history');
  const entries: Row[] = [];
  let seq = 0;
  for (const entity of audited) {
    const rows = tables[entityTable(entity)] ?? [];
    const sample = rng.sample(
      rows,
      Math.min(rows.length, Math.max(1, Math.floor(rows.length / 2)))
    );
    for (const row of sample) {
      const at = typeof row.createdAt === 'string' ? row.createdAt : ctx.time.now.toISOString();
      entries.push({
        id: ctx.ids.next('audit'),
        entity: entity.name,
        recordId: row.id,
        actorId: rng.pick([...personas]).id,
        action: 'create',
        at,
        seq: ++seq,
        changes: {},
      });
    }
  }
  return entries;
}

function seedNotificationHistory(
  ctx: GenerateContext,
  blueprint: Blueprint,
  tables: Record<string, Row[]>,
  personas: readonly { id: string }[]
): Row[] {
  if (personas.length === 0) return [];
  const wants =
    blueprint.notifications.length > 0 || blueprint.entities.some((e) => e.features.notifications);
  if (!wants) return [];
  const rng = ctx.rng.fork('blueprint:notification-history');
  const count = ctx.scale(3);
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const persona = rng.pick([...personas]);
    const entity = rng.pick(blueprint.entities);
    const pool = tables[entityTable(entity)] ?? [];
    const record = pool.length > 0 ? rng.pick(pool) : null;
    const at =
      record && typeof record.createdAt === 'string'
        ? record.createdAt
        : ctx.time.now.toISOString();
    rows.push({
      id: ctx.ids.next('notification'),
      personaId: persona.id,
      kind: `${entity.name}.create`,
      title: `Update on ${entity.name}`,
      body: '',
      createdAt: at,
      readAt: rng.chance(0.4) ? at : null,
      recordId: record?.id ?? null,
    });
  }
  return rows;
}

/**
 * Builds a generator bound to one blueprint. Prefer:
 * `const { generate } = await import('@protoyard/blueprint/generator').then(m => m.createBlueprintGenerator(bp))`
 */
export function createBlueprintGenerator(blueprint: Blueprint): BlueprintGenerator {
  const order = topologicalEntities(blueprint);
  const byName = new Map(blueprint.entities.map((e) => [e.name, e]));
  const generatorVersion = blueprintGeneratorVersion(blueprint);

  const generate = (ctx: GenerateContext): WorldSeed => {
    const team = generateTeam(ctx);
    const tables: Record<string, Row[]> = {};
    const orgCreatedAt = team.organization.createdAt;

    for (const entity of order) {
      const table = entityTable(entity);
      const count = ctx.scale(entity.seedCount ?? baseCountFor(entity, blueprint));
      const rows: Row[] = [];
      const rng = ctx.rng.fork(`entity:${entity.name}`);
      // One point set per geo field: point i belongs to row i, and more rows keep earlier points.
      const geo = entity.fields.flatMap((field) =>
        field.kind === 'geo'
          ? [
              {
                prop: inputProperty(field),
                required: field.required,
                points: geoPoints({
                  ctx,
                  region: field.region ?? DEFAULT_GEO_REGION,
                  count,
                  key: `${entity.name}.${field.name}`,
                }),
              },
            ]
          : []
      );
      // One seeded face per row and avatar field: no repeats until the library runs out, and
      // the team's faces are dealt last so records rarely share a face with a persona.
      const avatars = entity.fields.flatMap((field) =>
        field.kind === 'avatar'
          ? [
              {
                prop: inputProperty(field),
                ids: createAvatarPool(
                  ctx.rng.fork(`blueprint:avatars:${entity.name}.${field.name}`),
                  {
                    avoid: team.personas.map((persona) => persona.avatar),
                  }
                ).take(count),
              },
            ]
          : []
      );
      const trends = entity.fields.flatMap((field) =>
        (field.kind === 'number' || field.kind === 'integer' || field.kind === 'money') &&
        field.trend !== undefined
          ? [{ prop: inputProperty(field), byDay: trendByDay(field, entity, ctx, orgCreatedAt) }]
          : []
      );
      for (let i = 0; i < count; i++) {
        const fieldCtx: GenerateContext = {
          ...ctx,
          rng: rng.fork(`row:${i}`),
        };
        const values: Record<string, unknown> = {};
        for (const field of entity.fields) {
          values[inputProperty(field)] = valueForField(
            field,
            fieldCtx,
            team.personas,
            tables,
            byName,
            orgCreatedAt
          );
        }
        for (const { prop, required, points } of geo) {
          const point = points[i];
          values[prop] =
            point && (required || fieldCtx.rng.chance(0.9))
              ? { lat: point.lat, lng: point.lng }
              : null;
        }
        for (const { prop, ids } of avatars) values[prop] = ids[i] ?? null;
        const stamps = stampRow(fieldCtx, orgCreatedAt);
        for (const { prop, byDay } of trends) {
          values[prop] = byDay.get(stamps.createdAt.slice(0, 10)) ?? values[prop];
        }
        rows.push({
          id: ctx.ids.next(entity.name.replace(/-/g, '_')),
          ...values,
          ...stamps,
          ...(entity.features.softDelete ? { deletedAt: null, deletedBy: null } : {}),
        });
      }
      tables[table] = rows;
    }

    if (blueprint.entities.some((e) => e.features.audit)) {
      tables[FEATURE_TABLES.audit] = seedAuditHistory(ctx, blueprint, tables, team.personas);
    }
    if (
      blueprint.notifications.length > 0 ||
      blueprint.entities.some((e) => e.features.notifications)
    ) {
      tables[FEATURE_TABLES.notifications] = seedNotificationHistory(
        ctx,
        blueprint,
        tables,
        team.personas
      );
    }
    if (blueprint.entities.some((e) => e.features.files)) {
      tables[FEATURE_TABLES.files] = [];
    }

    return {
      organizations: team.organizations,
      personas: team.personas,
      memberships: team.memberships,
      tables,
    };
  };

  return { generate, generatorVersion };
}
