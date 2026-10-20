// @vitest-environment node
/**
 * The player path at scale (PLAN_004 Task 49): a fictional 40-entity
 * blueprint with about 25 fields per entity, 60 screens and every feature on
 * loads through the untrusted loader, derives a runtime definition and an app
 * model, and generates a massive-density world, each within a ceiling.
 *
 * Measured on an Apple Silicon laptop under heavy parallel load (2026-10-20,
 * Node 24), warm medians inside this test: untrusted load 15.7 ms, definition
 * + app model 4.1 ms, massive generation 828 ms (17,850 rows in 43 tables),
 * integrity validation 34 ms. A cold first run measured 160 ms, 25 ms, 2.2 s
 * and 176 ms. The ceilings below sit about 10× above the cold numbers, so
 * they catch order-of-magnitude regressions, not small drifts;
 * `docs/PERFORMANCE.md` records the numbers.
 */
import { readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { definePrototype, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { createBlueprintGenerator } from '../src/generator.ts';
import {
  type Blueprint,
  DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS,
  definePrototypeFromBlueprint,
  deriveIntegrity,
  loadUntrustedBlueprint,
} from '../src/index.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/large.blueprint.json', import.meta.url));
const CEILINGS_MS = { load: 2_000, define: 1_000, generate: 25_000, validate: 5_000 };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

function time<T>(run: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = run();
  return { value, ms: performance.now() - started };
}

const text = readFileSync(FIXTURE, 'utf8');

function load(): Blueprint {
  const result = loadUntrustedBlueprint(text);
  if (!result.success) throw new Error(JSON.stringify(result.issues.slice(0, 5)));
  return result.blueprint;
}

const massive = parseScenario({
  id: 'massive',
  name: 'Massive',
  seed: 4_904,
  referenceTime: '2026-06-01T12:00:00.000Z',
  density: 'massive',
  organization: { size: 12, ageDays: 365, subscription: 'enterprise' },
});

describe('a large blueprint on the player path', () => {
  it('is the advertised size, fictional, and inside the untrusted limits', () => {
    expect(statSync(FIXTURE).size).toBeLessThan(DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxBytes);
    const blueprint = load();
    expect(blueprint.entities).toHaveLength(40);
    const fields = blueprint.entities.reduce((sum, entity) => sum + entity.fields.length, 0);
    expect(fields / blueprint.entities.length).toBeGreaterThanOrEqual(24);
    expect(fields / blueprint.entities.length).toBeLessThanOrEqual(26);
    expect(blueprint.screens).toHaveLength(60);
    expect(new Set(blueprint.screens.map((screen) => screen.type))).toEqual(
      new Set([
        'list',
        'dashboard',
        'board',
        'calendar',
        'timeline',
        'map',
        'analytics',
        'settings',
      ])
    );
    for (const entity of blueprint.entities) {
      expect(entity.features, entity.name).toEqual({
        softDelete: true,
        audit: true,
        notifications: true,
        files: true,
        csv: true,
      });
    }
    // No literal contact data: anything that looks like an address is generated later.
    expect(text).not.toMatch(/@(?!example\.(com|org))[a-z0-9-]+\.[a-z]/i);
  });

  it('loads and derives a definition and an app model within ceilings', () => {
    const loads = Array.from({ length: 5 }, () => time(load));
    const blueprint = load();
    const defines = Array.from({ length: 5 }, () =>
      time(() => definePrototypeFromBlueprint(blueprint, { namespace: 'bp-large-fixture' }))
    );
    const derived = defines[0];
    if (!derived) throw new Error('no definition');
    const { definition, appModel } = derived.value;
    expect(() => definePrototype(definition)).not.toThrow();
    expect(definition.manifest.storage.schemaVersion).toBe(1);
    expect(appModel.routes.length).toBeGreaterThanOrEqual(100);
    expect(appModel.nav.length).toBeGreaterThan(20);
    const timings = {
      load: median(loads.map((t) => t.ms)),
      define: median(defines.map((t) => t.ms)),
    };
    console.info(
      `large blueprint: load ${timings.load.toFixed(1)} ms, define ${timings.define.toFixed(1)} ms (medians of 5)`
    );
    expect(timings.load).toBeLessThan(CEILINGS_MS.load);
    expect(timings.define).toBeLessThan(CEILINGS_MS.define);
  });

  it('generates a valid massive-density world within ceilings, deterministically', {
    timeout: 120_000,
  }, () => {
    const blueprint = load();
    const generator = createBlueprintGenerator(blueprint);
    const first = time(() => generator.generate(createGenerateContext(massive)));
    const second = time(() => generator.generate(createGenerateContext(massive)));
    const world = first.value;
    expect(second.value).toEqual(world);

    const rows = Object.values(world.tables).reduce((sum, table) => sum + table.length, 0);
    expect(rows).toBeGreaterThan(10_000);
    expect(rows).toBeLessThan(DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxWorldRows);
    for (const entity of blueprint.entities) {
      expect(
        world.tables[entity.plural.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase())]
          ?.length,
        entity.name
      ).toBeGreaterThan(0);
    }
    const emails = JSON.stringify(world).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) expect(email).toMatch(/@example\.(com|org)$/);

    const validation = time(() =>
      validateWorld(world, { ...deriveIntegrity(blueprint), referenceTime: massive.referenceTime })
    );
    expect(validation.value).toEqual([]);

    const generate = Math.min(first.ms, second.ms);
    console.info(
      `large blueprint: massive generate ${generate.toFixed(0)} ms (${rows} rows, ${Object.keys(world.tables).length} tables), validate ${validation.ms.toFixed(0)} ms`
    );
    expect(generate).toBeLessThan(CEILINGS_MS.generate);
    expect(validation.ms).toBeLessThan(CEILINGS_MS.validate);
  });
});
