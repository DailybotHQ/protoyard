import type { PrototypeDefinition, PrototypeRuntime, Scenario } from '@protoyard/core';
import {
  createGenerateContext,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { expect } from 'vitest';
import { createHarness } from './runtime.ts';

/**
 * The shared boot smoke for prototypes and templates. For every scenario the
 * definition declares, the same seed gives the same world (determinism) and
 * the world passes the integrity rules; then the default scenario boots on
 * the real runtime with an in-memory IndexedDB. Massive scenarios generate
 * once (integrity only) to keep the smoke fast. Pass a harness to keep the
 * booted runtime open; otherwise it is closed before returning.
 */
export async function expectBootableWorld<TDb = unknown>(
  definition: PrototypeDefinition,
  harness?: ReturnType<typeof createHarness<TDb>>
): Promise<{ runtime: PrototypeRuntime<TDb>; scenarios: Scenario[] }> {
  const scenarios = resolveScenarios(definition.scenarios, PRESETS);
  expect(scenarios.length).toBeGreaterThan(0);
  for (const scenario of scenarios) {
    const world = await definition.generate(createGenerateContext(scenario));
    if (scenario.density !== 'massive') {
      expect(await definition.generate(createGenerateContext(scenario)), scenario.id).toEqual(
        world
      );
    }
    expect(
      validateWorld(world, { ...definition.integrity, referenceTime: scenario.referenceTime }),
      scenario.id
    ).toEqual([]);
  }
  const own = harness ?? createHarness<TDb>(definition);
  const runtime = await own.boot();
  expect(runtime.session.personas().length).toBeGreaterThan(0);
  // A harness this helper created is closed here; a caller's harness stays open.
  if (!harness) own.closeAll();
  return { runtime, scenarios };
}
