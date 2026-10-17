import { base, en, Faker } from '@faker-js/faker';
import {
  createIdFactory,
  createRng,
  createTimeHelpers,
  type DataDensity,
  type GenerateContext,
  type Scenario,
} from '@protoyard/core';

/**
 * Version of the generator SDK. Bump it whenever the same scenario + seed can
 * produce a different world (helper output changed, faker upgraded, density
 * mapping tuned). It is recorded in `ActiveScenarioInfo.generatorVersion` so a
 * world can be traced back to the code that built it.
 */
export const GENERATOR_SDK_VERSION = 1;

export const DENSITY_FACTORS: Record<DataDensity, number> = {
  empty: 0,
  sparse: 0.25,
  normal: 1,
  dense: 4,
  massive: 25,
};

/**
 * "How many?" for a density. Rounded, and at least 1 whenever something was
 * asked for and the density is not `empty`, so sparse worlds are never blank.
 */
export function scaleForDensity(density: DataDensity, baseCount: number): number {
  if (density === 'empty' || baseCount <= 0) return 0;
  return Math.max(1, Math.round(baseCount * DENSITY_FACTORS[density]));
}

/** A Faker instance private to one generation run — never the shared global. */
export function createSeededFaker(seed: number, referenceTime: string | Date): Faker {
  const faker = new Faker({ locale: [en, base] });
  faker.seed(seed);
  faker.setDefaultRefDate(referenceTime);
  return faker;
}

/**
 * Everything a generator needs, derived only from the scenario: same seed,
 * reference time and SDK version → the same world on every machine.
 */
export function createGenerateContext(scenario: Scenario): GenerateContext {
  return {
    scenario,
    rng: createRng(scenario.seed),
    faker: createSeededFaker(scenario.seed, scenario.referenceTime),
    ids: createIdFactory(),
    time: createTimeHelpers(scenario.referenceTime),
    scale: (baseCount) => scaleForDensity(scenario.density, baseCount),
  };
}
