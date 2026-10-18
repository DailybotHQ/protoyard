import { type Theme, ValidationError } from '@protoyard/core';
import { BUILTIN_THEMES, createThemeFromSeed } from '@protoyard/themes';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPrototypeRuntime,
  MAX_CUSTOM_THEMES,
  type ProtoyardRuntime,
  THEME_FILE_FORMAT,
} from '../src/index.ts';
import { loadCustomThemes } from '../src/theme.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

/**
 * Theme Studio custom themes on the real runtime: saved in the control DB,
 * re-validated on boot, applied through the normal appearance pipeline.
 */

const open: ProtoyardRuntime[] = [];
afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

function harness() {
  const indexedDB = new IDBFactory() as unknown as globalThis.IDBFactory;
  const definition = createTasksDefinition({ namespace: 'custom-themes' });
  return async () => {
    const runtime = await createPrototypeRuntime(definition, {
      indexedDB,
      IDBKeyRange,
      themes: BUILTIN_THEMES,
      sleep: async () => {},
    });
    await runtime.scenarios.ensureSeeded();
    open.push(runtime);
    return runtime;
  };
}

const sunset = () => createThemeFromSeed({ id: 'sunset', name: 'Sunset', seed: '#e8590c' });

const issuesOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).issues;
};

describe('custom themes (Theme Studio storage)', () => {
  it('saves a theme, applies it and keeps it across a reload', async () => {
    const boot = harness();
    let runtime = await boot();
    const before = runtime.theme.themes().length;
    const seen: string[] = [];
    runtime.theme.subscribe((state) => seen.push(state.theme.value));

    const saved = await runtime.theme.saveCustom(sunset());
    expect(runtime.theme.isCustom('sunset')).toBe(true);
    expect(runtime.theme.themes()).toHaveLength(before + 1);
    expect(runtime.theme.get('sunset')?.light.primary).toBe(saved.light.primary);

    await runtime.theme.setPreference({ themeId: 'sunset' });
    expect(runtime.theme.appearance().theme.value).toBe('sunset');

    runtime.close();
    runtime = await boot();
    expect(runtime.theme.customThemes().map((t) => t.id)).toEqual(['sunset']);
    expect(runtime.theme.appearance().theme.value).toBe('sunset');
    expect(seen).toContain('sunset');
  });

  it('editing a custom theme under the same id notifies subscribers', async () => {
    const runtime = await harness()();
    await runtime.theme.saveCustom(sunset());
    await runtime.theme.setOverride({ themeId: 'sunset' });
    let notified = 0;
    runtime.theme.subscribe(() => notified++);
    const edited = createThemeFromSeed({ id: 'sunset', name: 'Sunset 2', seed: '#0b7285' });
    await runtime.theme.saveCustom(edited);
    expect(notified).toBeGreaterThan(0);
    expect(runtime.theme.get('sunset')?.name).toBe('Sunset 2');
    expect(runtime.theme.customThemes()).toHaveLength(1);
  });

  it('refuses ids of built-in themes and malformed values', async () => {
    const runtime = await harness()();
    const violet = BUILTIN_THEMES.find((t) => t.id === 'violet') as Theme;
    expect(await issuesOf(runtime.theme.saveCustom({ ...violet, name: 'Mine' }))).toEqual({
      id: '"violet" is a built-in or prototype theme. Pick another id.',
    });
    const bad = { ...sunset(), radius: 'url(javascript:alert(1))' };
    // Radius stays a free string in core; style lengths are strict.
    const badStyle = { ...sunset(), style: { shape: { borderWidth: '1px; color: red' } } };
    expect(Object.keys(await issuesOf(runtime.theme.saveCustom(badStyle as never)))).toEqual([
      'style.shape.borderWidth',
    ]);
    expect(await issuesOf(runtime.theme.saveCustom({ ...bad, id: 'Bad Id' }))).toHaveProperty('id');
    expect(runtime.theme.customThemes()).toHaveLength(0);
  });

  it('removing the active custom theme falls back to a known theme', async () => {
    const boot = harness();
    let runtime = await boot();
    await runtime.theme.saveCustom(sunset());
    await runtime.theme.setPreference({ themeId: 'sunset' });
    await runtime.theme.removeCustom('sunset');
    expect(runtime.theme.get('sunset')).toBeUndefined();
    expect(runtime.theme.appearance().theme.value).not.toBe('sunset');
    await expect(runtime.theme.removeCustom('violet')).rejects.toThrow(/not a custom theme/);
    runtime.close();
    runtime = await boot();
    expect(runtime.theme.customThemes()).toEqual([]);
  });

  it('exports a theme file and imports it back, validating untrusted JSON', async () => {
    const runtime = await harness()();
    await runtime.theme.saveCustom(sunset());
    const file = runtime.theme.exportTheme('sunset');
    expect(JSON.parse(file)).toMatchObject({ format: THEME_FILE_FORMAT, theme: { id: 'sunset' } });

    const renamed = file.replace('"id": "sunset"', '"id": "sunset-copy"');
    expect((await runtime.theme.importTheme(renamed)).id).toBe('sunset-copy');
    // A bare theme object works too.
    const bare = JSON.stringify(
      createThemeFromSeed({ id: 'forest', name: 'Forest', seed: '#2b8a3e' })
    );
    expect((await runtime.theme.importTheme(bare)).id).toBe('forest');

    expect(await issuesOf(runtime.theme.importTheme('{nope'))).toEqual({
      form: 'That is not valid JSON.',
    });
    expect(
      await issuesOf(runtime.theme.importTheme(JSON.stringify({ format: THEME_FILE_FORMAT })))
    ).toHaveProperty('form');
    expect(await issuesOf(runtime.theme.importTheme(' '.repeat(70_000)))).toHaveProperty('form');
    expect(runtime.theme.customThemes().map((t) => t.id)).toEqual([
      'sunset',
      'sunset-copy',
      'forest',
    ]);
  });

  it(`caps the list at ${MAX_CUSTOM_THEMES} themes`, async () => {
    const runtime = await harness()();
    const base = sunset();
    for (let i = 0; i < MAX_CUSTOM_THEMES; i++) {
      await runtime.theme.saveCustom({ ...base, id: `t-${i}`, name: `T ${i}` });
    }
    expect((await issuesOf(runtime.theme.saveCustom({ ...base, id: 'one-more' }))).form).toMatch(
      /up to 24/
    );
  });

  it('skips invalid or clashing stored themes at boot instead of failing', () => {
    const errors: unknown[] = [];
    const themes: Theme[] = [...BUILTIN_THEMES];
    const ids = loadCustomThemes(
      [
        sunset(),
        { ...sunset(), id: 'violet' },
        { id: 'broken', name: 'Broken' },
        { ...sunset(), id: 'evil', style: { shape: { borderWidth: '1px; color: red' } } },
      ],
      themes,
      (error) => errors.push(error)
    );
    expect([...ids]).toEqual(['sunset']);
    expect(themes.filter((t) => t.id === 'sunset')).toHaveLength(1);
    expect(themes.filter((t) => t.id === 'violet')).toHaveLength(1);
    expect(errors).toHaveLength(3);
    expect(loadCustomThemes('not a list', [], (e) => errors.push(e)).size).toBe(0);
    expect(loadCustomThemes(undefined, [], (e) => errors.push(e)).size).toBe(0);
    expect(errors).toHaveLength(4);
  });
});
