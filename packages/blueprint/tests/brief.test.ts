import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { createBlueprintGenerator } from '../src/generator.ts';
import {
  type AppBriefResult,
  ARCHETYPE_IDS,
  ARCHETYPES,
  blueprintFromBrief,
  deriveIntegrity,
  fieldFromPhrase,
  isAppBriefResult,
  isContentBriefResult,
  MAX_BRIEF_LENGTH,
  parseBlueprint,
  resolveBlueprintBrand,
} from '../src/index.ts';
import cases from './fixtures/briefs/briefs.json' with { type: 'json' };

/** Fixture briefs are all apps; narrow so entity/screen assertions type-check. */
function appFrom(
  brief: string,
  options?: Parameters<typeof blueprintFromBrief>[1]
): AppBriefResult {
  const result = blueprintFromBrief(brief, options);
  expect(result.kind).toBe('app');
  if (!isAppBriefResult(result)) throw new Error('expected app brief result');
  return result;
}

describe('blueprintFromBrief fixtures', () => {
  it('has 20 briefs that cover every archetype at least once', () => {
    expect(cases).toHaveLength(20);
    const covered = new Set(cases.map((c) => c.archetype));
    const newKitArchetypes = new Set(['assistant', 'team-chat', 'saas-onboarding']);
    for (const archetype of ARCHETYPES) {
      if (!newKitArchetypes.has(archetype.id))
        expect(covered, archetype.id).toContain(archetype.id);
    }
    expect(covered).toContain('tracker');
  });

  it.each(cases.map((c) => [c.id, c] as const))(
    '%s: valid blueprint with the expected archetype, entities, screens and layout',
    (_id, expected) => {
      const result = appFrom(expected.brief);
      expect(result.kind).toBe('app');
      expect(result.kindDetection.kind).toBe('app');
      expect(result.archetype).toBe(expected.archetype);
      expect(result.layout).toBe(expected.layout);
      expect(result.blueprint.entities.map((e) => e.name)).toEqual(expected.entities);
      // People-like entities get a face from the avatar library.
      expect(
        result.blueprint.entities
          .filter((e) => e.fields.some((f) => f.kind === 'avatar'))
          .map((e) => e.name)
      ).toEqual(expected.avatars);
      expect([...new Set(result.blueprint.screens.map((s) => s.type))].sort()).toEqual(
        expected.screens
      );
      // The JSON form parses to the same blueprint (what the CLI writes to disk).
      expect(parseBlueprint(JSON.parse(JSON.stringify(result.json)))).toEqual(result.blueprint);
      expect(result.rationale.length).toBeGreaterThan(2);
    }
  );

  it('is byte-identical across runs', () => {
    for (const c of cases) {
      const a = appFrom(c.brief);
      const b = appFrom(c.brief);
      expect(JSON.stringify(a.json), c.id).toBe(JSON.stringify(b.json));
      expect(a.rationale).toEqual(b.rationale);
      expect(a.kindDetection).toEqual(b.kindDetection);
    }
  });

  it('always emits the four standard roles and an AA brand theme', () => {
    for (const c of cases) {
      const { blueprint } = appFrom(c.brief);
      expect(blueprint.roles.map((r) => r.name)).toEqual(['owner', 'admin', 'member', 'viewer']);
      expect(blueprint.brand?.seed).toMatch(/^#[0-9a-f]{6}$/);
      // Throws BrandThemeError when the palette fails WCAG AA.
      expect(() =>
        resolveBlueprintBrand(blueprint.brand as never, { blueprintName: blueprint.name })
      ).not.toThrow();
    }
  });

  it('generates a valid world for every brief', () => {
    for (const c of cases) {
      const { blueprint } = appFrom(c.brief);
      const scenario = parseScenario({
        id: 'brief',
        name: 'Brief',
        seed: 7,
        referenceTime: '2026-06-01T09:00:00.000Z',
        organization: { ageDays: 60 },
      });
      const world = createBlueprintGenerator(blueprint).generate(createGenerateContext(scenario));
      expect(
        validateWorld(world, {
          ...deriveIntegrity(blueprint),
          referenceTime: scenario.referenceTime,
        }),
        c.id
      ).toEqual([]);
    }
  });

  it('synthesizes each brief quickly', () => {
    const started = performance.now();
    for (const c of cases) blueprintFromBrief(c.brief);
    const perBrief = (performance.now() - started) / cases.length;
    console.info(`blueprintFromBrief: ${perBrief.toFixed(2)} ms per brief`);
    // Target < 50 ms per brief; loose for loaded runners.
    expect(perBrief).toBeLessThan(250);
  });
});

describe('blueprintFromBrief behavior', () => {
  it('renames a tracked noun whose list route is reserved (/members) instead of failing', () => {
    const { blueprint } = appFrom(
      'A fictional climbing gym books classes, tracks members and their passes.'
    );
    const names = blueprint.entities.map((e) => e.name);
    expect(names).toContain('member-profile');
    expect(names).not.toContain('member');
    const pass = blueprint.entities.find((e) => e.name === 'pass');
    expect(pass?.fields.some((f) => f.name === 'memberProfile' && f.kind === 'relation')).toBe(
      true
    );
  });

  it('explains the archetype, added entities and inferred fields', () => {
    const { rationale } = appFrom(
      'A dog grooming salon that books appointments, tracks groomers and invoices with amount and due date.'
    );
    expect(rationale[0]).toBe('Archetype booking: matched appointments, salon.');
    expect(rationale).toContain('Entity invoice from "groomer, invoice", linked to appointment.');
    expect(rationale).toContain('Field invoice.amount (money) from "amount" (cue "amount").');
    expect(rationale).toContain('Field invoice.dueDate (date) from "due date" (cue "date").');
  });

  it('adds a photo to people-like entities, with a free field name', () => {
    const { blueprint, rationale } = appFrom(
      'A dog grooming salon that books appointments, tracks groomers and invoices with amount and due date.'
    );
    const groomer = blueprint.entities.find((e) => e.name === 'groomer');
    expect(groomer?.fields.find((f) => f.kind === 'avatar')).toEqual({
      name: 'avatar',
      kind: 'avatar',
      label: 'Photo',
      required: false,
      sensitive: false,
    });
    expect(rationale).toContain('Field groomer.avatar (avatar): groomer is a person.');
    expect(
      blueprint.entities.find((e) => e.name === 'invoice')?.fields.map((f) => f.kind)
    ).not.toContain('avatar');
    // A brief that already names an "avatar" field keeps it and the photo goes to `photo`.
    const taken = appFrom('A volunteer roster: track volunteers with avatar and phone.');
    const volunteer = taken.blueprint.entities.find((e) => e.name === 'volunteer');
    expect(volunteer?.fields.filter((f) => f.kind === 'avatar').map((f) => f.name)).toEqual([
      'photo',
    ]);
    expect(volunteer?.fields.find((f) => f.name === 'avatar')?.kind).toBe('text');
  });

  it('turns the main noun of a generic brief into the focus entity with inferred fields', () => {
    const { blueprint } = appFrom(
      'A tool to keep track of plants with watering date, location and health status.'
    );
    const plant = blueprint.entities[0];
    expect(plant?.name).toBe('plant');
    expect(plant?.fields.map((f) => `${f.name}:${f.kind}`)).toEqual(
      expect.arrayContaining(['wateringDate:date', 'location:geo', 'healthStatus:enum'])
    );
    expect(blueprint.screens.find((s) => s.type === 'map')).toMatchObject({ geoField: 'location' });
    expect(blueprint.screens.find((s) => s.type === 'board')).toMatchObject({ entity: 'plant' });
  });

  it('honors a forced archetype and name, and rejects unknown archetypes', () => {
    const result = appFrom('Anything at all.', {
      archetype: 'iot',
      name: 'Fern Example',
    });
    expect(result.archetype).toBe('iot');
    expect(result.blueprint.name).toBe('Fern Example');
    expect(result.rationale[0]).toBe('Archetype iot (chosen explicitly).');
    expect(ARCHETYPE_IDS).toContain('iot');
    const forcedKit = appFrom('An AI assistant for analytics dashboards.', {
      archetype: 'team-chat',
    });
    expect(forcedKit.archetype).toBe('team-chat');
    expect(forcedKit.blueprint.archetype?.id).toBe('team-chat');
    expect(forcedKit.rationale[0]).toBe('Archetype team-chat (chosen explicitly).');
    expect(() => blueprintFromBrief('x', { archetype: 'spaceship' })).toThrow(/unknown archetype/);
  });

  it('needs more than one stray keyword to pick an archetype', () => {
    expect(appFrom('Health tips for runners.').archetype).toBe('tracker');
    expect(appFrom('Answer tickets fast.').archetype).toBe('helpdesk');
  });

  it.each([
    [
      'assistant',
      'An AI assistant that answers policy questions with prompts and conversation history.',
      'matched ai assistant',
    ],
    [
      'team-chat',
      'A team chat for engineering groups with channels, direct messages and rooms.',
      'matched team chat',
    ],
    [
      'saas-onboarding',
      'SaaS onboarding for workspaces with member invitations, free trials and setup progress.',
      'matched saas onboarding',
    ],
    [
      'analytics',
      'Product analytics dashboard for event metrics, retention reports and conversion funnels.',
      'matched analytics',
    ],
  ])('selects %s from strong cues with deterministic rationale', (expected, brief, cue) => {
    const first = appFrom(brief);
    const second = appFrom(brief);

    expect(first.archetype).toBe(expected);
    expect(first.blueprint.archetype?.id).toBe(expected);
    if (expected === 'assistant') {
      expect(first.blueprint.archetype?.entities).toEqual({
        conversations: 'conversation',
        messages: 'message',
      });
    } else if (expected === 'team-chat') {
      expect(first.blueprint.archetype?.entities).toEqual({
        rooms: 'room',
        messages: 'message',
        members: 'team-member',
      });
    } else if (expected === 'saas-onboarding') {
      expect(first.blueprint.archetype?.entities).toEqual({
        workspaces: 'workspace',
        members: 'workspace-member',
      });
    } else {
      expect(first.blueprint.archetype?.entities).toEqual({
        events: 'event',
        metrics: 'metric',
      });
    }
    expect(first.rationale[0]).toContain(cue);
    expect(first.rationale).toEqual(second.rationale);
    expect(JSON.stringify(first.json)).toBe(JSON.stringify(second.json));
  });

  it('avoids choosing between equally strong new kit archetypes', () => {
    const result = appFrom('An assistant for analytics.');
    expect(result.archetype).toBe('tracker');
    expect(result.rationale[0]).toBe(
      'Archetype tracker: no archetype keyword matched, so a plain tracker.'
    );
  });

  it('handles empty and very long briefs', () => {
    const empty = appFrom('');
    expect(empty.archetype).toBe('tracker');
    expect(empty.blueprint.description).toBe('Tracker prototype.');
    const long = appFrom(`Track tickets. ${'word '.repeat(5_000)}`);
    expect(long.archetype).toBe('helpdesk');
    expect(MAX_BRIEF_LENGTH).toBe(5_000);
  });

  it('suggests a phone layout for mobile briefs', () => {
    expect(appFrom('An iOS and Android app to log runs.').layout).toBe('mobile-tabs');
    expect(appFrom('A web tool to log runs.').layout).toBe('sidebar');
  });
});

describe('blueprintFromBrief kind dispatch', () => {
  it('routes strong deck cues to the deck synthesizer before app archetypes', () => {
    const result = blueprintFromBrief(
      'A pitch deck of twelve slides about our fictional launch plan for Example Harbor.'
    );
    expect(isContentBriefResult(result)).toBe(true);
    if (!isContentBriefResult(result)) return;
    expect(result.kind).toBe('deck');
    expect(result.kindDetection.confidence).toMatch(/high|medium/);
    expect(result.json.kind).toBe('deck');
    expect(result.outline).toBe('pitch');
    const deck = result.json.deck as { slides: { id: string; layout: string }[] };
    expect(deck.slides.length).toBeGreaterThanOrEqual(7);
    expect(deck.slides[0]?.id).toBe('slide-title');
    expect(deck.slides[0]?.layout).toBe('title-hero');
    expect(deck.slides.map((s) => s.id).at(-1)).toMatch(/^slide-/);
    expect(result.rationale[0]).toBe(result.kindDetection.reason);
    expect(result.rationale.some((line) => /Outline: Pitch/i.test(line))).toBe(true);
    // No app entities / roles on a content draft.
    expect(result.json).not.toHaveProperty('entities');
    expect(result.json).not.toHaveProperty('roles');
  });

  it('lets an explicit kind override conflicting cues', () => {
    const asDeck = blueprintFromBrief('A CRM app that tracks deals and contacts.', {
      kind: 'deck',
    });
    expect(asDeck.kind).toBe('deck');
    expect(asDeck.kindDetection.confidence).toBe('explicit');
    expect(asDeck.kindDetection.reason).toMatch(/chosen explicitly/);

    const asApp = appFrom('A pitch deck of slides about our roadmap.', { kind: 'app' });
    expect(asApp.kind).toBe('app');
    expect(asApp.kindDetection.confidence).toBe('explicit');
    expect(asApp.archetype).toBeTruthy();
    expect(asApp.blueprint.entities.length).toBeGreaterThan(0);
  });

  it('routes landing-page and report briefs to page and doc synthesizers', () => {
    const page = blueprintFromBrief(
      'A marketing landing page for Example Harbor with a hero section and pricing.'
    );
    expect(page.kind).toBe('page');
    if (!isContentBriefResult(page)) return;
    expect(page.outline).toBe('landing');
    const pageSections = (page.json.page as { sections: { id: string; blocks: unknown[] }[] })
      .sections;
    expect(pageSections.length).toBeGreaterThanOrEqual(4);
    expect(pageSections[0]?.id).toBe('section-hero');
    expect(pageSections[0]?.blocks?.length).toBeGreaterThan(0);

    const doc = blueprintFromBrief(
      'Write the quarterly report for Example Harbor covering status and next steps.'
    );
    expect(doc.kind).toBe('doc');
    if (!isContentBriefResult(doc)) return;
    expect(doc.outline).toBe('report');
    expect(
      (doc.json.doc as { sections: unknown[] }).sections.map((s) => (s as { id: string }).id)
    ).toEqual([
      'section-title',
      'section-summary',
      'section-status',
      'section-findings',
      'section-next',
    ]);
  });

  it('rejects unknown explicit kinds with a stable actionable error', () => {
    expect(() => blueprintFromBrief('Anything', { kind: 'quiz' })).toThrow(
      /kind "quiz" needs a newer Protoyard/
    );
    expect(() => blueprintFromBrief('Anything', { kind: 'quiz' })).toThrow(
      /supports app, deck, page, doc/
    );
  });

  it('keeps content synthesis deterministic', () => {
    const brief = 'Keynote presentation slides for the Example Harbor all-hands.';
    const a = blueprintFromBrief(brief);
    const b = blueprintFromBrief(brief);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('fieldFromPhrase', () => {
  it.each([
    ['due date', 'dueDate', 'date'],
    ['pickup time', 'pickupTime', 'datetime'],
    ['amount', 'amount', 'money'],
    ['delivery address', 'deliveryAddress', 'geo'],
    ['assignee', 'assignee', 'persona'],
    ['priority', 'priority', 'enum'],
    ['guest count', 'guestCount', 'integer'],
    ['rating', 'rating', 'number'],
    ['contact email', 'contactEmail', 'email'],
    ['notes', 'notes', 'longText'],
    ['paid', 'paid', 'boolean'],
    ['color', 'color', 'text'],
  ])('%s → %s (%s)', (phrase, name, kind) => {
    expect(fieldFromPhrase(phrase)?.field).toMatchObject({ name, kind });
  });

  it('skips phrases that describe screens or are too long, and renames reserved names', () => {
    expect(fieldFromPhrase('a live map of delivery locations')).toBeNull();
    expect(fieldFromPhrase('the very long field name here')).toBeNull();
    expect(fieldFromPhrase('id')?.field.name).toBe('idValue');
  });
});
