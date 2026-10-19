import { createPrototypeRuntime } from '@protoyard/runtime';
import { appearanceCacheKey, noFlashScript } from '@protoyard/themes';
import { clearLibraryThemeCache, loadLibraryTheme } from '@protoyard/themes/library';
import { cleanup } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
// The runtime's own test prototype: a real world generator and Dexie schema.
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { mountPrototype, resolveLibraryTheme } from '../src/mount.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

/*
 * Every prototype can open any library theme from a link, with no code of
 * its own (ADR-023): mountPrototype hands the runtime a resolver backed by
 * the lazily imported `@protoyard/themes/library`.
 */

const root = document.documentElement;
const mounted: { destroy: () => Promise<void> }[] = [];

afterEach(async () => {
  for (const app of mounted.splice(0)) await app.destroy();
  cleanup();
  clearLibraryThemeCache();
  document.body.replaceChildren();
  root.removeAttribute('style');
  root.className = '';
  for (const key of Object.keys(root.dataset)) delete root.dataset[key];
  localStorage.clear();
});

async function boot(search: string, namespace: string) {
  const definition = createTasksDefinition({ namespace });
  const target = document.body.appendChild(document.createElement('div'));
  const app = await mountPrototype({
    definition,
    App: ProbeApp,
    target,
    search,
    devtools: false,
    createRuntime: (def, options) =>
      createPrototypeRuntime(def, { ...options, sleep: async () => {} }),
  });
  mounted.push(app);
  return app;
}

const primary = () => root.style.getPropertyValue('--py-primary');

describe('library themes in every prototype', () => {
  it('resolves library ids and nothing else', async () => {
    const theme = await resolveLibraryTheme('fintech-ledger');
    expect(theme?.id).toBe('fintech-ledger');
    expect(await resolveLibraryTheme('not-a-theme')).toBeUndefined();
    expect(await resolveLibraryTheme('violet')).toBeUndefined();
  });

  it('applies ?theme=<library id> as a visible override', async () => {
    const expected = await loadLibraryTheme('fintech-ledger');
    const app = await boot('?theme=fintech-ledger&mode=light', 'library-link');
    expect(app.error).toBeNull();
    const appearance = app.runtime?.theme.appearance();
    expect(appearance?.theme).toMatchObject({ value: 'fintech-ledger', source: 'override' });
    expect(primary()).toBe(expected.light.primary);
    expect(root.dataset.pyTheme).toBe('fintech-ledger');

    await app.runtime?.theme.setOverride({ mode: 'dark' });
    expect(primary()).toBe(expected.dark.primary);
  });

  it('caches the library look for the no-flash script, which replays it before the next boot', async () => {
    const expected = await loadLibraryTheme('fintech-ledger');
    await boot('?theme=fintech-ledger&mode=light', 'library-cache');
    const cached = JSON.parse(localStorage.getItem(appearanceCacheKey('library-cache')) ?? 'null');
    expect(cached).toMatchObject({
      themeId: 'fintech-ledger',
      vars: { '--py-primary': expected.light.primary },
    });

    // A fresh page: no styles yet, only the cache. The build inlines this script in <head>.
    root.removeAttribute('style');
    root.className = '';
    delete root.dataset.pyTheme;
    new Function(noFlashScript('library-cache'))();
    expect(primary()).toBe(expected.light.primary);
    expect(root.dataset.pyTheme).toBe('fintech-ledger');
  });

  it('keeps the library theme after a reload without the link (the override is stored)', async () => {
    const expected = await loadLibraryTheme('fintech-ledger');
    const first = await boot('?theme=fintech-ledger&mode=light', 'library-reload');
    await first.destroy();
    mounted.splice(mounted.indexOf(first), 1);
    clearLibraryThemeCache();
    root.removeAttribute('style');

    const second = await boot('', 'library-reload');
    expect(second.runtime?.theme.appearance().theme).toMatchObject({
      value: 'fintech-ledger',
      source: 'override',
    });
    expect(primary()).toBe(expected.light.primary);
  });

  it('falls back visibly to the manifest default for an unknown id', async () => {
    const app = await boot('?theme=not-a-theme', 'library-unknown');
    expect(app.error).toBeNull();
    expect(app.runtime?.theme.appearance().theme).toMatchObject({
      value: 'violet',
      source: 'default',
    });
  });
});
