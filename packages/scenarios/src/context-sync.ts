import { base, en, Faker } from '@faker-js/faker';
import type { GenerateContext, Scenario } from '@protoyard/core';
import { buildGenerateContext, seededFaker } from './context.ts';

/**
 * Synchronous variants for tests, the CLI and other Node callers. They import
 * faker statically, so app code should prefer `createGenerateContextAsync`
 * (the runtime does); with `sideEffects: false`, bundles that never call these
 * drop the static import and keep faker in its lazy chunk.
 */
const mod = { Faker, en, base };

export function createGenerateContext(scenario: Scenario): GenerateContext {
  return buildGenerateContext(scenario, mod);
}

export function createSeededFaker(seed: number, referenceTime: string | Date): Faker {
  return seededFaker(mod, seed, referenceTime);
}
