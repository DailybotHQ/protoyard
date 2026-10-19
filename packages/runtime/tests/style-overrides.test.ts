import type { PrototypeDefinition, ScenarioInput } from '@protoyard/core';
import { dumpTables } from '@protoyard/database';
import { BUILTIN_THEMES } from '@protoyard/themes';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createPrototypeRuntime } from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

function backend() {
  return { indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory, IDBKeyRange };
}

function start(
  definition: PrototypeDefinition = createTasksDefinition(),
  store = backend()
): ReturnType<typeof createPrototypeRuntime> {
  return createPrototypeRuntime(definition, {
    themes: BUILTIN_THEMES,
    sleep: async () => {},
    ...store,
  });
}

/** The tasks fixture whose `active-month` scenario picks round corners and subtle motion. */
function scenarioStyled(): PrototypeDefinition {
  const def = createTasksDefinition();
  return {
    ...def,
    scenarios: (def.scenarios ?? []).map((s) =>
      s.id === 'active-month'
        ? ({
            ...s,
            appearance: { ...s.appearance, radius: 'round', motion: 'subtle' },
          } as ScenarioInput)
        : s
    ),
  };
}

const THEME_DEFAULT = { value: null, source: 'default' } as const;

describe('style preset overrides', () => {
  it('fall back to the theme, then resolve override › scenario › theme with the source', async () => {
    const runtime = await start(scenarioStyled());
    const initial = runtime.theme.appearance();
    expect(initial.radius).toEqual(THEME_DEFAULT);
    expect(initial.elevation).toEqual(THEME_DEFAULT);
    expect(initial.font).toEqual(THEME_DEFAULT);
    expect(initial.motion).toEqual(THEME_DEFAULT);

    await runtime.scenarios.load('active-month');
    expect(runtime.theme.appearance().radius).toEqual({ value: 'round', source: 'scenario' });
    expect(runtime.theme.appearance().motion).toEqual({ value: 'subtle', source: 'scenario' });

    const seen: unknown[] = [];
    runtime.theme.subscribe((state) => seen.push(state.radius?.value));
    await runtime.theme.setOverride({
      radius: 'pill',
      elevation: 'flat',
      font: 'editorial',
      motion: 'expressive',
    });
    const state = runtime.theme.appearance();
    expect(state.radius).toEqual({ value: 'pill', source: 'override' });
    expect(state.elevation).toEqual({ value: 'flat', source: 'override' });
    expect(state.font).toEqual({ value: 'editorial', source: 'override' });
    expect(state.motion).toEqual({ value: 'expressive', source: 'override' });
    expect(seen).toContain('pill');
    expect(runtime.overrides.get()).toMatchObject({
      radius: 'pill',
      elevation: 'flat',
      font: 'editorial',
      motion: 'expressive',
    });

    await runtime.theme.clearOverride();
    expect(runtime.overrides.get()).toEqual({});
    const cleared = runtime.theme.appearance();
    expect(cleared.radius).toEqual({ value: 'round', source: 'scenario' });
    expect(cleared.motion).toEqual({ value: 'subtle', source: 'scenario' });
    expect(cleared.elevation).toEqual(THEME_DEFAULT);
    expect(cleared.font).toEqual(THEME_DEFAULT);
    runtime.close();
  });

  it('rejects ids outside the presets (never free CSS)', async () => {
    const runtime = await start();
    await expect(runtime.overrides.set({ radius: '3px' as never })).rejects.toThrow();
    await expect(runtime.theme.setOverride({ elevation: 'neon' as never })).rejects.toThrow();
    await expect(runtime.theme.setOverride({ font: 'Comic Sans' as never })).rejects.toThrow();
    await expect(
      runtime.theme.setOverride({ motion: 'cubic-bezier(0,0,1,1)' as never })
    ).rejects.toThrow();
    expect(runtime.overrides.get()).toEqual({});
    runtime.close();
  });

  it('clears one dimension through overrides.clear and keeps the rest', async () => {
    const runtime = await start();
    await runtime.overrides.set({ radius: 'square', motion: 'none' });
    await runtime.overrides.clear(['radius']);
    expect(runtime.theme.appearance().radius).toEqual(THEME_DEFAULT);
    expect(runtime.theme.appearance().motion).toEqual({ value: 'none', source: 'override' });
    runtime.close();
  });

  it('persist per prototype in the control DB across a reload and never write the data DB', async () => {
    const store = backend();
    const first = await start(createTasksDefinition(), store);
    await first.scenarios.ensureSeeded();
    const before = await dumpTables(first.db as never);
    await first.theme.setOverride({ radius: 'sharp', elevation: 'layered', font: 'mono' });
    expect(await dumpTables(first.db as never)).toEqual(before);
    first.close();

    const second = await start(createTasksDefinition(), store);
    expect(second.theme.appearance().radius).toEqual({ value: 'sharp', source: 'override' });
    expect(second.theme.appearance().elevation).toEqual({ value: 'layered', source: 'override' });
    expect(second.theme.appearance().font).toEqual({ value: 'mono', source: 'override' });
    expect(await dumpTables(second.db as never)).toEqual(before);
    second.close();

    // Another prototype (its own namespace) never sees them.
    const other = await start(createTasksDefinition({ namespace: 'other-tasks' }), store);
    expect(other.theme.appearance().radius).toEqual(THEME_DEFAULT);
    other.close();

    const cleared = await start(createTasksDefinition(), store);
    await cleared.theme.clearOverride();
    cleared.close();
    const third = await start(createTasksDefinition(), store);
    expect(third.theme.appearance().radius).toEqual(THEME_DEFAULT);
    expect(third.overrides.get()).toEqual({});
    third.close();
  });
});
