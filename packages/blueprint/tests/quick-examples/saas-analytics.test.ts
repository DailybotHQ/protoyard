// @vitest-environment node
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { createBlueprintGenerator } from '../../src/generator.ts';
import {
  deriveAppModel,
  deriveIntegrity,
  entityTable,
  evaluateValidationSuccess,
  parseBlueprint,
  validationBaseline,
} from '../../src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const EXAMPLES = resolve(ROOT, 'blueprints/quick');
type Name = 'saas-onboarding' | 'analytics';

function load(name: Name) {
  const path = resolve(EXAMPLES, `${name}.json`);
  const text = readFileSync(path, 'utf8');
  return { text, bytes: statSync(path).size, blueprint: parseBlueprint(JSON.parse(text)) };
}

function worldFor(name: Name) {
  const { blueprint } = load(name);
  const scenario = parseScenario({
    id: `quick-${name}`,
    name: `Quick ${name}`,
    seed: 93_001,
    referenceTime: '2026-06-15T12:00:00.000Z',
    density: blueprint.archetype?.scenarioDefaults.density ?? 'normal',
    activity: { level: blueprint.archetype?.scenarioDefaults.activity ?? 'normal' },
    organization: {
      id: 'org_quick_examples',
      name: 'Protoyard Example Studio',
      size: 6,
      ageDays: 45,
      subscription: 'pro',
    },
  });
  return {
    blueprint,
    scenario,
    world: createBlueprintGenerator(blueprint).generate(createGenerateContext(scenario)),
  };
}

/** Rows per entity name, the shape the validation-task evaluator reads. */
function rowsByEntity(name: Name) {
  const { blueprint, world } = worldFor(name);
  return Object.fromEntries(
    blueprint.entities.map((entity) => [entity.name, world.tables[entityTable(entity)] ?? []])
  ) as Record<string, Record<string, unknown>[]>;
}

describe('quick SaaS onboarding and analytics blueprints', () => {
  it('keeps both examples compact and declares only their lazy kit contracts', () => {
    const saas = load('saas-onboarding');
    const analytics = load('analytics');
    expect(saas.bytes).toBeLessThan(5_000);
    expect(analytics.bytes).toBeLessThan(5_000);
    expect(saas.blueprint.archetype).toEqual({
      id: 'saas-onboarding',
      kits: ['@protoyard/saas', '@protoyard/saas-ui'],
      entities: { workspaces: 'workspace', members: 'teammate' },
      screens: [{ kind: 'saas-onboarding', path: '/onboarding' }],
      scenarioDefaults: { density: 'normal', activity: 'normal' },
    });
    expect(analytics.blueprint.archetype).toEqual({
      id: 'analytics',
      kits: [
        '@protoyard/analytics',
        '@protoyard/analytics-ui/grid',
        '@protoyard/analytics-ui/date-range',
      ],
      entities: { events: 'event', metrics: 'metric' },
      screens: [{ kind: 'analytics-dashboard', path: '/analytics' }],
      scenarioDefaults: { density: 'dense', activity: 'normal' },
    });
  });

  it('routes only the starter screens, without shadowing the built-in members page', () => {
    expect(
      deriveAppModel(load('saas-onboarding').blueprint).routes.map((route) => route.path)
    ).toEqual([
      '/',
      '/workspaces',
      '/workspaces/:id',
      '/teammates',
      '/teammates/:id',
      '/workspaces/new',
      '/team',
      '/members',
    ]);
    expect(deriveAppModel(load('analytics').blueprint).routes.map((route) => route.path)).toEqual([
      '/',
      '/events',
      '/events/:id',
      '/metrics',
      '/metrics/:id',
      '/explore',
      '/members',
    ]);
  });

  it('generates deterministic, valid fictional worlds', () => {
    for (const name of ['saas-onboarding', 'analytics'] as const) {
      const first = worldFor(name);
      const second = worldFor(name);
      expect(first.world, name).toEqual(second.world);
      expect(
        validateWorld(first.world, {
          ...deriveIntegrity(first.blueprint),
          referenceTime: first.scenario.referenceTime,
        }),
        name
      ).toEqual([]);
      for (const entity of first.blueprint.entities) {
        expect(
          first.world.tables[entityTable(entity)]?.length,
          `${name}.${entity.name}`
        ).toBeGreaterThan(0);
      }
    }
    const teammates = rowsByEntity('saas-onboarding').teammate ?? [];
    for (const row of teammates) expect(String(row.email)).toMatch(/@example\.(com|org)$/);
    const events = rowsByEntity('analytics').event ?? [];
    for (const row of events) {
      expect(['signup', 'activation', 'purchase']).toContain(row.type);
      expect(Number.isInteger(row.revenue ?? 0)).toBe(true);
    }
  });

  it('keeps the SaaS boundaries explicit: simulated, no credentials or provider claims', () => {
    for (const name of ['saas-onboarding', 'analytics'] as const) {
      const { text, blueprint } = load(name);
      expect(blueprint.description, name).toMatch(/fictional/i);
      expect(blueprint.description, name).toMatch(/simulated/i);
      expect(text, name).not.toMatch(
        /password|secret|token|api[-_ ]?key|client[-_ ]?id|oauth|stripe|google|github/i
      );
      expect(text, name).not.toMatch(/\b(records|seedData|rows)\s*"?\s*:/i);
    }
    expect(load('saas-onboarding').blueprint.description).toMatch(
      /no real accounts, email or payments/
    );
  });

  it('ships validation tasks that start unmet and succeed after the matching action', () => {
    const cases = [
      {
        name: 'saas-onboarding' as const,
        task: 'create-workspace',
        entity: 'workspace',
        route: '/workspaces/new',
      },
      {
        name: 'saas-onboarding' as const,
        task: 'invite-teammate',
        entity: 'teammate',
        route: '/team',
      },
      { name: 'analytics' as const, task: 'record-metric', entity: 'metric', route: '/metrics' },
    ];
    for (const { name, task, entity, route } of cases) {
      const tasks = load(name).blueprint.validation?.tasks ?? [];
      const success = tasks.find((candidate) => candidate.id === task)?.success;
      expect(success, task).toBeDefined();
      if (!success) continue;
      const rows = rowsByEntity(name);
      const baseline = validationBaseline(rows);
      expect(
        evaluateValidationSuccess(success, { route, rows, baseline }).met,
        `${task} at start`
      ).toBe(false);
      const after = { ...rows, [entity]: [...(rows[entity] ?? []), { id: `${entity}_new` }] };
      expect(
        evaluateValidationSuccess(success, { route, rows: after, baseline }).met,
        `${task} after`
      ).toBe(true);
    }
    const explore = load('analytics').blueprint.validation?.tasks.find(
      (t) => t.id === 'find-signups'
    )?.success;
    expect(explore && evaluateValidationSuccess(explore, { route: '/explore', rows: {} }).met).toBe(
      true
    );
    expect(explore && evaluateValidationSuccess(explore, { route: '/', rows: {} }).met).toBe(false);
  });
});
