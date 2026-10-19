import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { createBlueprintGenerator } from '../src/generator.ts';
import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  blueprintFromBrief,
  deriveIntegrity,
  fieldFromPhrase,
  MAX_BRIEF_LENGTH,
  parseBlueprint,
  resolveBlueprintBrand,
} from '../src/index.ts';
import cases from './fixtures/briefs/briefs.json' with { type: 'json' };

describe('blueprintFromBrief fixtures', () => {
  it('has 20 briefs that cover every archetype at least once', () => {
    expect(cases).toHaveLength(20);
    const covered = new Set(cases.map((c) => c.archetype));
    for (const archetype of ARCHETYPES) expect(covered, archetype.id).toContain(archetype.id);
    expect(covered).toContain('tracker');
  });

  it.each(cases.map((c) => [c.id, c] as const))(
    '%s: valid blueprint with the expected archetype, entities, screens and layout',
    (_id, expected) => {
      const result = blueprintFromBrief(expected.brief);
      expect(result.archetype).toBe(expected.archetype);
      expect(result.layout).toBe(expected.layout);
      expect(result.blueprint.entities.map((e) => e.name)).toEqual(expected.entities);
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
      const a = blueprintFromBrief(c.brief);
      const b = blueprintFromBrief(c.brief);
      expect(JSON.stringify(a.json), c.id).toBe(JSON.stringify(b.json));
      expect(a.rationale).toEqual(b.rationale);
    }
  });

  it('always emits the four standard roles and an AA brand theme', () => {
    for (const c of cases) {
      const { blueprint } = blueprintFromBrief(c.brief);
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
      const { blueprint } = blueprintFromBrief(c.brief);
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
  it('explains the archetype, added entities and inferred fields', () => {
    const { rationale } = blueprintFromBrief(
      'A dog grooming salon that books appointments, tracks groomers and invoices with amount and due date.'
    );
    expect(rationale[0]).toBe('Archetype booking: matched appointments, salon.');
    expect(rationale).toContain('Entity invoice from "groomer, invoice", linked to appointment.');
    expect(rationale).toContain('Field invoice.amount (money) from "amount" (cue "amount").');
    expect(rationale).toContain('Field invoice.dueDate (date) from "due date" (cue "date").');
  });

  it('turns the main noun of a generic brief into the focus entity with inferred fields', () => {
    const { blueprint } = blueprintFromBrief(
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
    const result = blueprintFromBrief('Anything at all.', {
      archetype: 'iot',
      name: 'Fern Example',
    });
    expect(result.archetype).toBe('iot');
    expect(result.blueprint.name).toBe('Fern Example');
    expect(result.rationale[0]).toBe('Archetype iot (chosen explicitly).');
    expect(ARCHETYPE_IDS).toContain('iot');
    expect(() => blueprintFromBrief('x', { archetype: 'spaceship' })).toThrow(/unknown archetype/);
  });

  it('needs more than one stray keyword to pick an archetype', () => {
    expect(blueprintFromBrief('Health tips for runners.').archetype).toBe('tracker');
    expect(blueprintFromBrief('Answer tickets fast.').archetype).toBe('helpdesk');
  });

  it('handles empty and very long briefs', () => {
    const empty = blueprintFromBrief('');
    expect(empty.archetype).toBe('tracker');
    expect(empty.blueprint.description).toBe('Tracker prototype.');
    const long = blueprintFromBrief(`Track tickets. ${'word '.repeat(5_000)}`);
    expect(long.archetype).toBe('helpdesk');
    expect(MAX_BRIEF_LENGTH).toBe(5_000);
  });

  it('suggests a phone layout for mobile briefs', () => {
    expect(blueprintFromBrief('An iOS and Android app to log runs.').layout).toBe('mobile-tabs');
    expect(blueprintFromBrief('A web tool to log runs.').layout).toBe('sidebar');
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
