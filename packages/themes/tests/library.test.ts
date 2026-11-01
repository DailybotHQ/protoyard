import { ThemeSchema } from '@protoyard/core';
import { THEME_LIBRARY_META as TEXULI_PORTED_META } from '@texuli/tokens/library';
import { BUILTIN_PRESET_IDS, EXPAND_THEME_LIBRARY_META } from '@texuli/tokens/library-expand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disableFullThemeLibrary, enableFullThemeLibrary } from '../src/library/full.ts';
import {
  ALL_LIBRARY_THEME_IDS,
  clearLibraryThemeCache,
  EXPANDED_LIBRARY_THEME_IDS,
  findLibraryThemeMeta,
  getLibraryThemeMeta,
  isCatalogThemeId,
  isExpandedLibraryThemeId,
  isLibraryThemeId,
  LIBRARY_THEME_IDS,
  loadFullLibraryMeta,
  loadLibraryTheme,
  loadLibraryThemeDefinition,
  resetExpandedLibraryLoader,
  setExpandedLibraryLoader,
  THEME_LIBRARY_META,
} from '../src/library/index.ts';
import { BUILTIN_THEMES } from '../src/presets.ts';

// These suites cover the full library (204 themes), which is the default.
afterEach(() => {
  clearLibraryThemeCache();
});

const _loadDefinitions = async () =>
  Promise.all((await loadFullLibraryMeta()).map((meta) => loadLibraryThemeDefinition(meta.id)));

describe('the library comes from @texuli/tokens', () => {
  it('holds every Texuli library theme except the six Protoyard built-ins, each once', async () => {
    const builtins = new Set<string>(BUILTIN_PRESET_IDS);
    const texuli = [...TEXULI_PORTED_META, ...EXPAND_THEME_LIBRARY_META]
      .map((meta) => meta.id)
      .filter((id) => !builtins.has(id));
    const full = await loadFullLibraryMeta();
    expect(full.map((meta) => meta.id)).toEqual(texuli);
    expect(new Set(texuli).size).toBe(texuli.length);
    expect(await loadFullLibraryMeta()).toBe(full);
    // The synchronous catalog is the ported set, first in the full library.
    expect(THEME_LIBRARY_META.map((meta) => meta.id)).toEqual(
      TEXULI_PORTED_META.map((meta) => meta.id)
    );
    expect(full.slice(0, THEME_LIBRARY_META.length)).toEqual([...THEME_LIBRARY_META]);
    // Built-ins stay BUILTIN_THEMES: no picker shows an id twice.
    for (const theme of BUILTIN_THEMES) {
      expect(await findLibraryThemeMeta(theme.id)).toBeUndefined();
    }
    // 200+ themes are available to prototypes: the full library plus the built-ins.
    expect(full.length + BUILTIN_THEMES.length).toBeGreaterThanOrEqual(200);
  });

  it('keeps the boot-path id lists equal, in order, to the catalog and expanded set Texuli ships', () => {
    const builtins = new Set<string>(BUILTIN_PRESET_IDS);
    expect(LIBRARY_THEME_IDS).toEqual(TEXULI_PORTED_META.map((meta) => meta.id));
    expect(EXPANDED_LIBRARY_THEME_IDS).toEqual(
      EXPAND_THEME_LIBRARY_META.map((meta) => meta.id).filter((id) => !builtins.has(id))
    );
    expect(ALL_LIBRARY_THEME_IDS).toEqual([...LIBRARY_THEME_IDS, ...EXPANDED_LIBRARY_THEME_IDS]);
    expect(ALL_LIBRARY_THEME_IDS).toHaveLength(204);
    for (const meta of THEME_LIBRARY_META) {
      expect(isLibraryThemeId(meta.id), meta.id).toBe(true);
      expect(isCatalogThemeId(meta.id), meta.id).toBe(true);
      expect(isExpandedLibraryThemeId(meta.id), meta.id).toBe(false);
    }
    for (const id of EXPANDED_LIBRARY_THEME_IDS) {
      expect(isLibraryThemeId(id), id).toBe(true);
      expect(isCatalogThemeId(id), id).toBe(false);
      expect(isExpandedLibraryThemeId(id), id).toBe(true);
    }
    for (const theme of BUILTIN_THEMES) expect(isLibraryThemeId(theme.id), theme.id).toBe(false);
    expect(isLibraryThemeId('no-such-theme')).toBe(false);
  });

  it('falls back to the catalog when the expanded set is off or cannot load, and retries', async () => {
    const expandedId = EXPANDED_LIBRARY_THEME_IDS[0] as string;
    disableFullThemeLibrary();
    clearLibraryThemeCache();
    try {
      expect(await loadFullLibraryMeta()).toBe(THEME_LIBRARY_META);
      expect(await findLibraryThemeMeta(expandedId)).toBeUndefined();
      await expect(loadLibraryTheme(expandedId)).rejects.toThrow(/expanded set/);
      await expect(loadLibraryThemeDefinition(expandedId)).rejects.toThrow(/expanded set/);
      await expect(loadLibraryTheme('no-such-theme')).rejects.toThrow(/Unknown library theme/);
      // Catalog themes load as always, with tokens from @texuli/tokens.
      expect((await loadLibraryTheme('fintech-ledger')).id).toBe('fintech-ledger');

      // A single-file export that left the expanded set out: the import rejects.
      let fail = true;
      const loader = vi.fn(() =>
        fail
          ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
          : import('@texuli/tokens/library-expand')
      );
      setExpandedLibraryLoader(loader);
      // A second caller during the failing load resolves to the catalog too, never rejects.
      const [first, second] = await Promise.all([loadFullLibraryMeta(), loadFullLibraryMeta()]);
      expect(first).toBe(THEME_LIBRARY_META);
      expect(second).toBe(THEME_LIBRARY_META);
      expect(await loadFullLibraryMeta()).toBe(THEME_LIBRARY_META);
      await expect(loadLibraryTheme(expandedId)).rejects.toThrow(/dynamically imported/);
      // Unknown ids never touch the expanded set.
      const calls = loader.mock.calls.length;
      expect(await findLibraryThemeMeta('no-such-theme')).toBeUndefined();
      expect(loader.mock.calls.length).toBe(calls);
      // A later call tries again.
      fail = false;
      expect((await loadFullLibraryMeta()).length).toBe(ALL_LIBRARY_THEME_IDS.length);
      expect((await loadLibraryTheme(expandedId)).id).toBe(expandedId);
    } finally {
      resetExpandedLibraryLoader();
      clearLibraryThemeCache();
    }
    // enableFullThemeLibrary() is kept and restores the default.
    disableFullThemeLibrary();
    enableFullThemeLibrary();
    expect((await loadFullLibraryMeta()).length).toBe(ALL_LIBRARY_THEME_IDS.length);
  });

  it('finds and loads expanded themes on demand, by id', async () => {
    const expandedId = EXPAND_THEME_LIBRARY_META.find(
      (meta) => !(BUILTIN_PRESET_IDS as readonly string[]).includes(meta.id)
    )?.id as string;
    expect(getLibraryThemeMeta(expandedId)).toBeUndefined();
    expect((await findLibraryThemeMeta(expandedId))?.id).toBe(expandedId);
    const theme = await loadLibraryTheme(expandedId);
    expect(ThemeSchema.parse(theme).id).toBe(expandedId);
    expect((await loadLibraryThemeDefinition(expandedId)).id).toBe(expandedId);
  });
});
