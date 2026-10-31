import { deriveStores, parseBlueprint } from '@protoyard/blueprint';
import { cleanup, configure, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import BlueprintAppHarness from './fixtures/BlueprintAppHarness.svelte';
import { motionProbe } from './fixtures/motion-probe.ts';

/**
 * The blueprint `motion` block in the shared app shell (the player and every
 * generated app): `BlueprintApp` renders a `texuli/motion` MotionProvider at
 * the blueprint's level. `texuli/motion` is wrapped by a probe that records
 * each provider's level and renders the real one.
 */
vi.mock('texuli/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('texuli/motion')>();
  const { motionProbe: probe } = await import('./fixtures/motion-probe.ts');
  probe.Real = actual.MotionProvider as never;
  const { default: MotionProbe } = await import('./fixtures/MotionProbe.svelte');
  return { ...actual, MotionProvider: MotionProbe };
});

configure({ asyncUtilTimeout: 10_000 });

afterEach(() => {
  cleanup();
  motionProbe.levels.length = 0;
});

async function renderWith(motion?: { level: 'full' | 'subtle' | 'none' }) {
  const blueprint = parseBlueprint({ ...helpdeskBlueprint, ...(motion ? { motion } : {}) });
  const definition = createBlueprintDefinition(`crud-motion-${motion?.level ?? 'default'}`);
  const harness = createHarness({
    ...definition,
    database: {
      ...definition.database,
      versions: definition.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(blueprint) } : version
      ),
    },
  });
  const runtime = await harness.boot('owner');
  render(BlueprintAppHarness, { runtime, blueprint });
  return harness;
}

describe('BlueprintApp motion', () => {
  it('plays at full motion when the blueprint declares none', async () => {
    const harness = await renderWith();
    expect(motionProbe.levels).toEqual(['full']);
    harness.closeAll();
  });

  it.each(['subtle', 'none'] as const)('caps every Texuli animation at %s', async (level) => {
    const harness = await renderWith({ level });
    expect(motionProbe.levels).toEqual([level]);
    harness.closeAll();
  });
});
