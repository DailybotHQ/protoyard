import type { Faker } from '@faker-js/faker';
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

/** The parts of `@faker-js/faker` a generation run needs. */
export interface FakerModule {
  Faker: typeof Faker;
  en: unknown;
  base: unknown;
}

/** A Faker instance private to one generation run — never the shared global. */
export function seededFaker(mod: FakerModule, seed: number, referenceTime: string | Date): Faker {
  const faker = new mod.Faker({ locale: [mod.en, mod.base] as never });
  faker.seed(seed);
  faker.setDefaultRefDate(referenceTime);
  return faker;
}

/** Builds the context from an already-loaded faker module. */
export function buildGenerateContext(scenario: Scenario, mod: FakerModule): GenerateContext {
  return {
    scenario,
    rng: createRng(scenario.seed),
    faker: seededFaker(mod, scenario.seed, scenario.referenceTime),
    ids: createIdFactory(),
    time: createTimeHelpers(scenario.referenceTime),
    scale: (baseCount) => scaleForDensity(scenario.density, baseCount),
  };
}

let fakerModule: Promise<FakerModule> | null = null;

/**
 * Loads faker on demand. It is by far the largest dependency and only needed
 * when a world is GENERATED (first seed, load, reset, advance), so bundlers
 * split it into its own chunk that normal page opens never download.
 */
export function loadFaker(): Promise<FakerModule> {
  fakerModule ??= import('@faker-js/faker').then((mod) => ({
    Faker: mod.Faker,
    en: mod.en,
    base: mod.base,
  }));
  return fakerModule;
}

/**
 * Everything a generator needs, derived only from the scenario: same seed,
 * reference time and SDK version → the same world on every machine. This is
 * what the runtime uses; it keeps faker out of the main bundle.
 */
export async function createGenerateContextAsync(scenario: Scenario): Promise<GenerateContext> {
  return buildGenerateContext(scenario, await loadFaker());
}
