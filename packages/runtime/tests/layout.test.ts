import { type LayoutId, type PrototypeDefinition, parseManifest } from '@protoyard/core';
import { dumpTables } from '@protoyard/database';
import { BUILTIN_THEMES } from '@protoyard/themes';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createPrototypeRuntime, type RuntimeOptions } from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

function backend() {
  return { indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory, IDBKeyRange };
}

function start(
  definition: PrototypeDefinition,
  store: ReturnType<typeof backend> = backend(),
  extra: RuntimeOptions = {}
) {
  return createPrototypeRuntime(definition, {
    themes: BUILTIN_THEMES,
    sleep: async () => {},
    ...store,
    ...extra,
  });
}

/** The tasks fixture with a `preview.layout` and, optionally, a scenario layout. */
function layoutDefinition(
  layout: Record<string, unknown> | undefined,
  scenarioLayout?: LayoutId
): PrototypeDefinition {
  const def = createTasksDefinition();
  return {
    ...def,
    manifest: parseManifest({
      ...def.manifest,
      preview: { ...def.manifest.preview, ...(layout ? { layout } : {}) },
    }),
    scenarios: (def.scenarios ?? []).map((s) =>
      scenarioLayout && s.id === 'active-month'
        ? { ...s, appearance: { ...s.appearance, layout: scenarioLayout } }
        : s
    ),
  };
}

describe('layout resolution', () => {
  it('reports custom from the manifest default when a prototype declares nothing', async () => {
    const runtime = await start(createTasksDefinition());
    await runtime.scenarios.ensureSeeded();
    expect(runtime.theme.appearance().layout).toEqual({ value: 'custom', source: 'default' });
    // A custom prototype renders its own layout: other ids fall back visibly.
    await runtime.theme.setOverride({ layout: 'sidebar' });
    expect(runtime.theme.appearance().layout).toEqual({ value: 'custom', source: 'default' });
    runtime.close();
  });

  it('resolves override › scenario › manifest, with the source', async () => {
    const runtime = await start(
      layoutDefinition({ id: 'sidebar', supported: ['rail', 'top-nav', 'docs'] }, 'docs')
    );
    expect(runtime.theme.appearance().layout).toEqual({ value: 'sidebar', source: 'default' });
    await runtime.scenarios.load('active-month');
    expect(runtime.theme.appearance().layout).toEqual({ value: 'docs', source: 'scenario' });

    const seen: string[] = [];
    runtime.theme.subscribe((state) => seen.push(state.layout.value));
    await runtime.theme.setOverride({ layout: 'rail' });
    expect(runtime.theme.appearance().layout).toEqual({ value: 'rail', source: 'override' });
    expect(runtime.overrides.get()).toMatchObject({ layout: 'rail' });
    expect(seen).toContain('rail');

    await runtime.theme.clearOverride();
    expect(runtime.overrides.get().layout).toBeUndefined();
    expect(runtime.theme.appearance().layout).toEqual({ value: 'docs', source: 'scenario' });
    runtime.close();
  });

  it('falls back to the manifest layout for ids outside `supported`', async () => {
    const runtime = await start(layoutDefinition({ id: 'top-nav', supported: ['sidebar'] }));
    await runtime.overrides.set({ layout: 'wizard' });
    expect(runtime.theme.appearance().layout).toEqual({ value: 'top-nav', source: 'default' });
    await runtime.overrides.set({ layout: 'sidebar' });
    expect(runtime.theme.appearance().layout).toEqual({ value: 'sidebar', source: 'override' });
    await expect(runtime.overrides.set({ layout: 'holy-grail' as never })).rejects.toThrow();
    runtime.close();
  });

  it('persists the override across a reload and never writes the data DB', async () => {
    const store = backend();
    const definition = layoutDefinition({ id: 'sidebar' });
    const first = await start(definition, store);
    await first.scenarios.ensureSeeded();
    const before = await dumpTables(first.db as never);
    await first.theme.setOverride({ layout: 'master-detail' });
    expect(await dumpTables(first.db as never)).toEqual(before);
    first.close();

    const second = await start(definition, store);
    expect(second.theme.appearance().layout).toEqual({
      value: 'master-detail',
      source: 'override',
    });
    expect(await dumpTables(second.db as never)).toEqual(before);
    second.close();
  });
});

describe('?layout= link', () => {
  it('applies a supported layout as a clearable override', async () => {
    const runtime = await start(layoutDefinition({ id: 'sidebar' }), backend(), {
      link: { layout: 'rail' },
    });
    await runtime.scenarios.ensureSeeded();
    expect(runtime.overrides.get()).toEqual({ layout: 'rail' });
    expect(runtime.theme.appearance().layout).toEqual({ value: 'rail', source: 'override' });
    await runtime.overrides.clear(['layout']);
    expect(runtime.theme.appearance().layout).toEqual({ value: 'sidebar', source: 'default' });
    runtime.close();
  });

  it('ignores a layout the prototype does not support', async () => {
    const runtime = await start(createTasksDefinition(), backend(), {
      link: { layout: 'rail' },
    });
    await runtime.scenarios.ensureSeeded();
    expect(runtime.overrides.get()).toEqual({});
    expect(runtime.theme.appearance().layout).toEqual({ value: 'custom', source: 'default' });
    runtime.close();
  });
});
