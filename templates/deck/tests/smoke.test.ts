import { createPrototypeRuntime } from '@protoyard/runtime';
import {
  createGenerateContext,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { definition } from '../src/prototype.ts';

/**
 * The starter test every prototype made from this template inherits: the same
 * seed gives the same valid world, and the default scenario boots on the real
 * runtime. Add your own domain tests next to it (services, policy, screens).
 */
describe('deck', () => {
  it('generates the same valid world for the same seed and boots on the real runtime', async () => {
    const scenarios = resolveScenarios(definition.scenarios, PRESETS);
    const first = scenarios[0];
    if (!first) throw new Error('the template declares no scenario');
    const world = await definition.generate(createGenerateContext(first));
    expect(await definition.generate(createGenerateContext(first))).toEqual(world);
    expect(
      validateWorld(world, { ...definition.integrity, referenceTime: first.referenceTime })
    ).toEqual([]);
    const runtime = await createPrototypeRuntime(definition, { sleep: async () => {} });
    try {
      await runtime.scenarios.ensureSeeded();
      expect(runtime.session.personas().length).toBeGreaterThan(0);
    } finally {
      runtime.close();
    }
  });
});
