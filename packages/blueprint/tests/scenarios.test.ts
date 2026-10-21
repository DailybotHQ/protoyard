// @vitest-environment node

import { parseBlueprint } from '@protoyard/blueprint';
import { PRESETS, resolveScenarios } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { scenarios as templateScenarios } from '../../../templates/crud-app/src/scenarios/index.ts';
import { blueprintScenarios } from '../src/index.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Scenario Fixture',
  entities: [
    {
      name: 'project',
      plural: 'projects',
      fields: [{ name: 'name', kind: 'text', required: true }],
      titleField: 'name',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
});

describe('blueprintScenarios', () => {
  it('matches the crud-app template scenario definitions', () => {
    expect(blueprintScenarios(blueprint)).toEqual(templateScenarios);
  });

  it('resolves and validates all default scenarios with stable seeds', () => {
    const definitions = blueprintScenarios(blueprint);
    const resolved = resolveScenarios(definitions, PRESETS);

    expect(definitions.map(({ id, seed }) => [id, seed])).toEqual([
      ['empty', 123_001],
      ['active', 123_002],
      ['viewer', 123_003],
      ['massive', 123_004],
    ]);
    expect(resolved.map(({ id }) => id)).toEqual(['empty', 'active', 'viewer', 'massive']);
    expect(resolved.map(({ seed }) => seed)).toEqual([123_001, 123_002, 123_003, 123_004]);
  });

  it('describes the empty scenario without naming any product domain', () => {
    const empty = blueprintScenarios(blueprint).find(({ id }) => id === 'empty');
    // Every blueprint gets this scenario, so the copy cannot assume projects or tasks.
    expect(empty?.description).toBe('Team only — no records yet.');
  });

  it('returns independent definitions for each call', () => {
    const first = blueprintScenarios(blueprint);
    first[0]!.organization!.size = 99;

    expect(blueprintScenarios(blueprint)[0]?.organization?.size).toBe(4);
  });
});
