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
 * once (integrity only) to keep the smoke fast.
 */
export async function expectBootableWorld<TDb = unknown>(
  definition: PrototypeDefinition,
  harness = createHarness<TDb>(definition)
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
  const runtime = await harness.boot();
  expect(runtime.session.personas().length).toBeGreaterThan(0);
  return { runtime, scenarios };
}
