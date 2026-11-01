import type { DataDensity, ScenarioInput } from '@protoyard/core';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { helpdeskBlueprint } from '../../../tests/fixtures/blueprint-prototype.ts';
import {
  BLUEPRINT_GENERATOR_SDK,
  blueprintGeneratorVersion,
  createBlueprintGenerator,
} from '../src/generator.ts';
import { deriveIntegrity, parseBlueprint } from '../src/index.ts';

const densitites: DataDensity[] = ['empty', 'sparse', 'normal', 'dense', 'massive'];

function scenario(density: DataDensity, seed = 50_001): ScenarioInput {
  return {
    id: `gen-${density}`,
    name: `Generator ${density}`,
    seed,
    referenceTime: '2026-06-01T09:00:00.000Z',
    density,
    organization: {
      id: 'org_gen',
      name: 'Generator Org',
      size: 6,
      ageDays: 90,
      subscription: 'pro',
    },
  };
}

const richBlueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Generator fixture',
  entities: [
    {
      name: 'company',
      plural: 'companies',
      fields: [
        { name: 'name', kind: 'text', required: true, fake: 'company.name', minLength: 2 },
        { name: 'website', kind: 'url' },
        { name: 'industry', kind: 'enum', values: ['saas', 'agency', 'other'], default: 'saas' },
      ],
      titleField: 'name',
      features: { audit: true, notifications: true },
    },
    {
      name: 'contact',
      plural: 'contacts',
      fields: [
        { name: 'fullName', kind: 'text', required: true, fake: 'person.fullName' },
        { name: 'email', kind: 'email', required: true },
        { name: 'company', kind: 'relation', to: 'company', required: true, onDelete: 'cascade' },
        { name: 'owner', kind: 'persona' },
        { name: 'tags', kind: 'tags' },
        { name: 'score', kind: 'integer', min: 0, max: 100 },
        { name: 'budget', kind: 'money', min: 0, max: 500_000 },
        { name: 'active', kind: 'boolean', default: true },
        { name: 'joinedOn', kind: 'date' },
      ],
      titleField: 'fullName',
      ownerField: 'owner',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  notifications: [
    {
      on: 'create',
      entity: 'contact',
      notify: 'owner',
      title: 'New contact {fullName}',
    },
  ],
});

describe('createBlueprintGenerator', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    const gen = createBlueprintGenerator(helpdeskBlueprint);
    const a = gen.generate(createGenerateContext(parseScenario(scenario('normal', 42))));
    const b = gen.generate(createGenerateContext(parseScenario(scenario('normal', 42))));
    const c = gen.generate(createGenerateContext(parseScenario(scenario('normal', 99))));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(gen.generatorVersion).toBe(blueprintGeneratorVersion(helpdeskBlueprint));
    expect(gen.generatorVersion).not.toBe(0);
  });

  it('passes validateWorld for every density preset', () => {
    const gen = createBlueprintGenerator(richBlueprint);
    const integrity = deriveIntegrity(richBlueprint);
    for (const density of densitites) {
      const s = parseScenario(scenario(density, 7_700 + densitites.indexOf(density)));
      const world = gen.generate(createGenerateContext(s));
      expect(
        validateWorld(world, { ...integrity, referenceTime: s.referenceTime }),
        density
      ).toEqual([]);
      if (density === 'empty') {
        expect(world.tables.companies ?? []).toHaveLength(0);
        expect(world.tables.contacts ?? []).toHaveLength(0);
      } else {
        expect((world.tables.companies ?? []).length).toBeGreaterThan(0);
        expect((world.tables.contacts ?? []).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('fictional contact data', () => {
  it('keeps url, email and phone values on example domains and 555 numbers despite fake hints', () => {
    const contactBlueprint = parseBlueprint({
      formatVersion: 1,
      name: 'Contact fixture',
      entities: [
        {
          name: 'account',
          plural: 'accounts',
          seedCount: 40,
          titleField: 'name',
          fields: [
            { name: 'name', kind: 'text', required: true, fake: 'company.name' },
            { name: 'domain', kind: 'url', fake: 'internet.url' },
            { name: 'mobile', kind: 'phone', fake: 'phone.number' },
            { name: 'email', kind: 'email', fake: 'internet.email' },
            { name: 'site', kind: 'text', fake: 'internet.url' },
            { name: 'contact', kind: 'text', fake: 'internet.email' },
            { name: 'line', kind: 'text', fake: 'phone.number' },
          ],
        },
      ],
      roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    });
    const gen = createBlueprintGenerator(contactBlueprint);
    const rows =
      gen.generate(createGenerateContext(parseScenario(scenario('normal', 11)))).tables.accounts ??
      [];
    expect(rows.length).toBeGreaterThan(0);
    const url = /^https:\/\/example\.(?:com|org)\//;
    const email = /@example\.(?:com|org)$/;
    const phone = /^\+1-555-\d{3}-\d{4}$/;
    for (const row of rows) {
      for (const [key, pattern] of [
        ['domain', url],
        ['site', url],
        ['email', email],
        ['contact', email],
        ['mobile', phone],
        ['line', phone],
      ] as const) {
        const value = row[key];
        if (value === null || value === undefined) continue;
        expect(String(value), key).toMatch(pattern);
      }
    }
  });
});

describe('generator source hygiene', () => {
  it('exposes the generator without ambient PRNG/clock APIs on the public surface', () => {
    // AC-nondet is the bash gate on packages/blueprint/src/generator.ts.
    // Here we only assert the module exports the factory used by that file.
    expect(typeof createBlueprintGenerator).toBe('function');
    expect(BLUEPRINT_GENERATOR_SDK).toBeGreaterThan(0);
  });
});

/** A fictional booking desk that uses every distribution hint. */
const distBlueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Distribution fixture',
  entities: [
    {
      name: 'booking',
      plural: 'bookings',
      seedCount: 60,
      fields: [
        { name: 'title', kind: 'text', required: true, fake: 'company.buzzPhrase' },
        {
          name: 'status',
          kind: 'enum',
          values: ['requested', 'confirmed', 'done', 'cancelled'],
          default: 'requested',
          required: true,
        },
        {
          name: 'channel',
          kind: 'enum',
          values: ['web', 'phone', 'walk-in'],
          weights: [6, 3, 0],
        },
        { name: 'startsAt', kind: 'datetime', window: 'future' },
        { name: 'heldOn', kind: 'date', window: { from: -10, to: 10 } },
        { name: 'loggedOn', kind: 'date', window: 'past' },
        { name: 'amount', kind: 'money', min: 0, max: 200_000, trend: 'growth' },
        { name: 'rating', kind: 'number', min: 0, max: 5, trend: 'decline' },
        { name: 'guests', kind: 'integer', min: 1, max: 40, trend: 'seasonal' },
        { name: 'street', kind: 'text', fake: 'location.streetAddress' },
      ],
      titleField: 'title',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
});

describe('generator distributions', () => {
  it('changes the generator version when a distribution hint changes', () => {
    const changed = parseBlueprint({
      ...distBlueprint,
      entities: distBlueprint.entities.map((e) => ({ ...e, seedCount: 61 })),
    });
    expect(blueprintGeneratorVersion(changed)).not.toBe(blueprintGeneratorVersion(distBlueprint));
  });
});
