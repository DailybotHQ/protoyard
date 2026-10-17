import { base, en, Faker } from '@faker-js/faker';
import {
  createIdFactory,
  createRng,
  createTimeHelpers,
  type GenerateContext,
  type ScenarioDefinition,
} from '@protoyard/core';
import { PRESETS, resolveScenarios } from '@protoyard/scenarios';

/**
 * Test helper that builds a GenerateContext straight from core primitives, so
 * prototype generator tests do not depend on the runtime. Mirrors
 * `createGenerateContext` in @protoyard/scenarios.
 */
export function contextFor(
  scenarios: readonly ScenarioDefinition[],
  id: string,
  seedOverride?: number
): GenerateContext {
  // Same resolution as the runtime: `extends` against own scenarios + presets.
  const resolved = resolveScenarios(scenarios, PRESETS).find((s) => s.id === id);
  if (!resolved) throw new Error(`unknown scenario ${id}`);
  const scenario = seedOverride ? { ...resolved, seed: seedOverride } : resolved;
  const faker = new Faker({ locale: [en, base] });
  faker.seed(scenario.seed);
  faker.setDefaultRefDate(scenario.referenceTime);
  const factor = { empty: 0, sparse: 0.25, normal: 1, dense: 4, massive: 25 }[scenario.density];
  return {
    scenario,
    rng: createRng(scenario.seed),
    faker,
    ids: createIdFactory(),
    time: createTimeHelpers(scenario.referenceTime),
    scale: (n) => (factor === 0 ? 0 : Math.max(1, Math.round(n * factor))),
  };
}
