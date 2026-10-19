import {
  defineTheme,
  type PrototypeDefinition,
  type Theme,
  ThemePaletteSchema,
} from '@protoyard/core';
import { loadLibraryTheme } from '@protoyard/themes';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPrototypeRuntime,
  type ProtoyardRuntime,
  type RuntimeOptions,
} from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

/**
 * The async theme resolver (ADR-023): ids that are not in the static theme
 * list (library themes) load on demand, register once with a `library`
 * origin, and survive reloads. Unknown or failing ids keep the visible
 * fallback to the manifest default.
 */

const palette = Object.fromEntries(
  Object.keys(ThemePaletteSchema.shape).map((key) => [key, '#123456'])
) as never;
const themes = [
  defineTheme({ id: 'violet', name: 'Violet', light: palette, dark: palette }),
  defineTheme({ id: 'ocean', name: 'Ocean', light: palette, dark: palette }),
];
const ledger = defineTheme({
  id: 'ledger',
  name: 'Ledger',
  light: palette,
  dark: palette,
  density: 0.9,
});

/** A resolver that only knows `ledger` and counts its calls. */
function fakeResolver(known: Theme = ledger) {
  const calls: string[] = [];
  const resolveTheme = async (id: string) => {
    calls.push(id);
    return id === known.id ? known : undefined;
  };
  return { calls, resolveTheme };
}

const open: ProtoyardRuntime[] = [];
afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

function harness(definition: PrototypeDefinition = createTasksDefinition()) {
  const store = { indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory, IDBKeyRange };
  return async (extra: RuntimeOptions = {}) => {
    const runtime = await createPrototypeRuntime(definition, {
      themes,
      sleep: async () => {},
      onError: () => {},
      ...store,
      ...extra,
    });
    open.push(runtime);
    return runtime;
  };
}

describe('async theme resolver', () => {
  it('an override to a resolver-only id loads, registers and applies it', async () => {
    const { calls, resolveTheme } = fakeResolver();
    const runtime = await harness()({ resolveTheme });
    await runtime.scenarios.ensureSeeded();
    expect(runtime.theme.get('ledger')).toBeUndefined();

    await runtime.theme.setOverride({ themeId: 'ledger' });

    expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'override' });
    expect(runtime.theme.appearance().density).toEqual({ value: 0.9, source: 'default' });
    expect(runtime.theme.themes().map((t) => t.id)).toEqual(['violet', 'ocean', 'ledger']);
    expect(runtime.theme.isLibrary('ledger')).toBe(true);
    expect(runtime.theme.isLibrary('violet')).toBe(false);
    expect(runtime.theme.isCustom('ledger')).toBe(false);
    expect(calls).toEqual(['ledger']);

    // Already registered: no second load.
    await runtime.theme.setOverride({ themeId: 'ocean' });
    await runtime.theme.setOverride({ themeId: 'ledger' });
    expect(calls).toEqual(['ledger']);
  });

  it('a reload keeps the library theme with no default flash', async () => {
    const boot = harness();
    let runtime = await boot(fakeResolver());
    await runtime.scenarios.ensureSeeded();
    await runtime.theme.setOverride({ themeId: 'ledger' });
    runtime.close();

    const { calls, resolveTheme } = fakeResolver();
    runtime = await boot({ resolveTheme });
    // Resolved during boot, before the first appearance anyone can observe.
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'override' });
    expect(runtime.theme.themes().some((t) => t.id === 'ledger')).toBe(true);
    expect(calls).toEqual(['ledger']);
  });

  it('a persona preference for a library id applies and survives a reload', async () => {
    const boot = harness();
    let runtime = await boot(fakeResolver());
    await runtime.scenarios.ensureSeeded();
    await runtime.theme.setPreference({ themeId: 'ledger' });
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'preference' });
    runtime.close();

    runtime = await boot(fakeResolver());
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'preference' });
  });

  it('switching to a persona whose preference is a library theme loads it', async () => {
    const boot = harness();
    let runtime = await boot(fakeResolver());
    await runtime.scenarios.ensureSeeded();
    const first = runtime.session.principal()?.persona.id as string;
    const other = runtime.session.personas().find((p) => p.id !== first)?.id as string;
    await runtime.theme.setPreference({ themeId: 'ledger' });
    await runtime.session.switchActor(other);
    runtime.close();

    const { calls, resolveTheme } = fakeResolver();
    runtime = await boot({ resolveTheme });
    expect(runtime.theme.appearance().theme.value).toBe('violet');
    expect(calls).toEqual([]);
    await runtime.session.switchActor(first);
    await vi.waitFor(() =>
      expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'preference' })
    );
    expect(calls).toEqual(['ledger']);
  });

  it('a failing resolver falls back visibly to the manifest default and reports', async () => {
    const errors: unknown[] = [];
    const runtime = await harness()({
      onError: (error) => errors.push(error),
      resolveTheme: async () => {
        throw new Error('chunk failed to load');
      },
    });
    await runtime.scenarios.ensureSeeded();

    await runtime.theme.setOverride({ themeId: 'ledger' });

    expect(runtime.theme.appearance().theme).toEqual({ value: 'violet', source: 'default' });
    expect(runtime.theme.get('ledger')).toBeUndefined();
    expect(String(errors.at(-1))).toContain('chunk failed to load');
    await expect(runtime.theme.ensure('ledger')).resolves.toBeUndefined();
  });

  it('unknown ids, invalid themes and mismatched ids are never registered', async () => {
    const errors: unknown[] = [];
    const runtime = await harness()({
      onError: (error) => errors.push(error),
      resolveTheme: async (id) => {
        if (id === 'broken') return { id: 'broken', name: 'Broken', light: {}, dark: {} } as never;
        if (id === 'alias') return ledger;
        return undefined;
      },
    });
    await runtime.scenarios.ensureSeeded();

    for (const id of ['nope', 'broken', 'alias']) {
      await expect(runtime.theme.ensure(id)).resolves.toBeUndefined();
      await runtime.theme.setOverride({ themeId: id });
      expect(runtime.theme.appearance().theme).toEqual({ value: 'violet', source: 'default' });
    }
    expect(runtime.theme.themes().map((t) => t.id)).toEqual(['violet', 'ocean']);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('without a resolver an unknown id keeps today’s fallback', async () => {
    const runtime = await harness()();
    await runtime.scenarios.ensureSeeded();
    await expect(runtime.theme.ensure('ledger')).resolves.toBeUndefined();
    await expect(runtime.theme.ensure('ocean')).resolves.toMatchObject({ id: 'ocean' });
    await runtime.theme.setOverride({ themeId: 'ledger' });
    expect(runtime.theme.appearance().theme).toEqual({ value: 'violet', source: 'default' });
  });

  it('ensure() returns known themes directly and shares one in-flight load', async () => {
    const { calls, resolveTheme } = fakeResolver();
    const runtime = await harness()({ resolveTheme });
    const [a, b] = await Promise.all([
      runtime.theme.ensure('ledger'),
      runtime.theme.ensure('ledger'),
    ]);
    expect(a?.id).toBe('ledger');
    expect(b).toBe(a);
    expect(calls).toEqual(['ledger']);
    await expect(runtime.theme.ensure('violet')).resolves.toMatchObject({ id: 'violet' });
    expect(calls).toEqual(['ledger']);
  });

  it('shows the load as pending so the global bar covers the chunk', async () => {
    let release!: () => void;
    const runtime = await harness()({
      resolveTheme: (id) =>
        new Promise<Theme | undefined>((resolve) => {
          release = () => resolve(id === 'ledger' ? ledger : undefined);
        }),
    });
    await runtime.scenarios.ensureSeeded();
    const done = runtime.theme.setOverride({ themeId: 'ledger' });
    await vi.waitFor(() => expect(runtime.pending.count()).toBe(1));
    expect(runtime.pending.list()[0]?.label).toContain('ledger');
    release();
    await done;
    expect(runtime.pending.count()).toBe(0);
    expect(runtime.theme.appearance().theme.value).toBe('ledger');
  });

  it('a ?theme= link to a library id becomes a visible override', async () => {
    const runtime = await harness()({
      ...fakeResolver(),
      link: { scenario: 'active-month', theme: 'ledger' },
    });
    await runtime.scenarios.ensureSeeded();
    expect(runtime.overrides.get()).toEqual({ themeId: 'ledger' });
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'override' });
  });

  it('a scenario appearance naming a library theme loads it', async () => {
    const base = createTasksDefinition({ namespace: 'resolver-scenario' });
    const definition: PrototypeDefinition = {
      ...base,
      scenarios: base.scenarios.map((s) =>
        s.id === 'active-month' ? { ...s, appearance: { themeId: 'ledger' } } : s
      ),
    };
    const boot = harness(definition);
    let runtime = await boot(fakeResolver());
    await runtime.scenarios.ensureSeeded();
    await vi.waitFor(() =>
      expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'scenario' })
    );
    runtime.close();

    runtime = await boot(fakeResolver());
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ledger', source: 'scenario' });
  });

  it('restoring a snapshot taken in a library theme loads and pins it', async () => {
    const author = await harness()(fakeResolver());
    await author.scenarios.ensureSeeded();
    await author.theme.setOverride({ themeId: 'ledger' });
    const { json } = await author.snapshots.exportJson();

    const reader = await harness()(fakeResolver());
    await reader.scenarios.ensureSeeded();
    await reader.snapshots.importJson(json, { restore: true });
    expect(reader.theme.appearance().theme).toEqual({ value: 'ledger', source: 'override' });
  });

  it('works with the real theme library loader', async () => {
    const runtime = await harness()({
      resolveTheme: (id) => loadLibraryTheme(id).catch(() => undefined),
    });
    await runtime.scenarios.ensureSeeded();
    await runtime.theme.setOverride({ themeId: 'fintech-ledger' });
    expect(runtime.theme.appearance().theme).toEqual({
      value: 'fintech-ledger',
      source: 'override',
    });
    expect(runtime.theme.get('fintech-ledger')?.name).toBeTruthy();
    expect(runtime.theme.isLibrary('fintech-ledger')).toBe(true);
  });
});
