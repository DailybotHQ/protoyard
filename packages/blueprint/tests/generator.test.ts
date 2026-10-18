import type { DataDensity, ScenarioInput } from '@protoyard/core';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { helpdeskBlueprint } from '../../../tests/fixtures/blueprint-prototype.ts';
import {
  ALLOWED_FAKE_PATHS,
  BLUEPRINT_GENERATOR_SDK,
  blueprintGeneratorVersion,
  createBlueprintGenerator,
  hashBlueprint,
  topologicalEntities,
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

  it('uses only example.com / example.org emails and topological order', () => {
    const order = topologicalEntities(richBlueprint).map((e) => e.name);
    expect(order.indexOf('company')).toBeLessThan(order.indexOf('contact'));

    const gen = createBlueprintGenerator(richBlueprint);
    const world = gen.generate(createGenerateContext(parseScenario(scenario('dense', 12))));
    const contacts = (world.tables.contacts ?? []) as Array<{ email?: string }>;
    for (const row of contacts) {
      expect(row.email).toMatch(/@example\.(com|org)$/);
    }
    // Audit history is seeded when features.audit is on and density > empty.
    expect((world.tables.auditEntries ?? []).length).toBeGreaterThan(0);
    expect((world.tables.notifications ?? []).length).toBeGreaterThan(0);
  });

  it('honors allow-listed fake paths and stable generatorVersion hashing', () => {
    expect(ALLOWED_FAKE_PATHS).toContain('company.name');
    expect(hashBlueprint(richBlueprint)).toBe(hashBlueprint(richBlueprint));
    expect(blueprintGeneratorVersion(richBlueprint)).toBe(
      blueprintGeneratorVersion(parseBlueprint(JSON.parse(JSON.stringify(richBlueprint))))
    );
    expect(BLUEPRINT_GENERATOR_SDK).toBeGreaterThan(0);

    const gen = createBlueprintGenerator(richBlueprint);
    const world = gen.generate(createGenerateContext(parseScenario(scenario('normal', 3))));
    const companies = world.tables.companies ?? [];
    expect(companies[0]?.name).toEqual(expect.any(String));
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
