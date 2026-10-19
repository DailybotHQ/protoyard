import { ThemeSchema, ThemeStyleSchema } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { contrastRatio, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from '../src/contrast.ts';
import { FONT_CATALOG } from '../src/fonts.ts';
import { themeFromDefinition } from '../src/library/build.ts';
import {
  clearLibraryThemeCache,
  getLibraryThemeMeta,
  LIBRARY_THEME_DEFINITIONS,
  type LibraryThemeDefinition,
  listCollections,
  listThemeLibrary,
  loadAllLibraryThemes,
  loadLibraryTheme,
  searchThemeLibrary,
  THEME_COLLECTIONS,
  THEME_CONTRAST_LEVELS,
  THEME_LIBRARY_META,
  THEME_MOODS,
} from '../src/library/index.ts';
import { NEUTRAL_FAMILIES } from '../src/palette.ts';
import { BUILTIN_THEMES } from '../src/presets.ts';

afterEach(() => {
  clearLibraryThemeCache();
});

describe('theme library registry', () => {
  it('ships 30+ unique presets with category metadata', () => {
    expect(THEME_LIBRARY_META.length).toBeGreaterThanOrEqual(30);
    const ids = THEME_LIBRARY_META.map((meta) => meta.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const meta of THEME_LIBRARY_META) {
      expect(meta.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.category.length).toBeGreaterThan(0);
      expect(meta.seed).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(meta.tags.length).toBeGreaterThan(0);
    }
    expect(getLibraryThemeMeta('fintech-ledger')?.category).toBe('fintech');
    expect(listThemeLibrary({ category: 'accessible' }).length).toBeGreaterThanOrEqual(2);
    expect(listThemeLibrary({ tag: 'neon' }).some((m) => m.id === 'gaming-neon')).toBe(true);
  });

  it('loads tokens lazily and caches the result', async () => {
    const first = await loadLibraryTheme('glass-frost');
    const second = await loadLibraryTheme('glass-frost');
    expect(first).toBe(second);
    expect(ThemeSchema.parse(first)).toEqual(first);
    expect(first.style.surface).toBe('glass');
    expect(first.fontFamily).toContain('geometric');
    await expect(loadLibraryTheme('not-a-theme')).rejects.toThrow(/Unknown library theme/);
  });

  it('every library theme × mode meets WCAG AA for text and UI pairs', async () => {
    const themes = await loadAllLibraryThemes();
    expect(themes.length).toBe(THEME_LIBRARY_META.length);
    const failures: string[] = [];
    for (const theme of themes) {
      ThemeSchema.parse(theme);
      for (const mode of ['light', 'dark'] as const) {
        const palette = theme[mode];
        for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[fg], palette[bg]);
          if (ratio < 4.5)
            failures.push(`${theme.id}/${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
        }
        for (const [fg, bg] of UI_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[fg], palette[bg]);
          if (ratio < 3)
            failures.push(`${theme.id}/${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)} (UI)`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('theme values stay inside the hardened ThemeSchema', () => {
  it('every built-in and library theme passes the color, font and radius guards', async () => {
    const themes = [...BUILTIN_THEMES, ...(await loadAllLibraryThemes())];
    expect(themes.length).toBeGreaterThan(BUILTIN_THEMES.length);
    for (const theme of themes) {
      const result = ThemeSchema.safeParse(theme);
      expect(result.success, `${theme.id}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });
});

/** Every rule a library definition must follow; the style profile goes through core's zod schema. */
function definitionIssues(definition: LibraryThemeDefinition): string[] {
  const issues: string[] = [];
  const hex = /^#[0-9a-f]{6}$/i;
  if (!/^[a-z][a-z0-9-]*$/.test(definition.id)) issues.push('id is not kebab-case');
  if (!definition.name || definition.name.length > 40) issues.push('name must be 1–40 characters');
  if (!definition.description) issues.push('description is empty');
  if (!definition.category) issues.push('category is empty');
  if (!definition.tags.length || definition.tags.some((tag) => tag !== tag.toLowerCase())) {
    issues.push('tags must be non-empty and lowercase');
  }
  if (!hex.test(definition.seed)) issues.push(`seed ${definition.seed} is not #rrggbb`);
  if (definition.secondary !== undefined && !hex.test(definition.secondary)) {
    issues.push(`secondary ${definition.secondary} is not #rrggbb`);
  }
  if (definition.font !== undefined && !FONT_CATALOG.some((font) => font.id === definition.font)) {
    issues.push(`unknown font ${definition.font}`);
  }
  if (definition.neutral !== undefined && !NEUTRAL_FAMILIES.includes(definition.neutral)) {
    issues.push(`unknown neutral ${definition.neutral}`);
  }
  if (definition.collection !== undefined && !THEME_COLLECTIONS.includes(definition.collection)) {
    issues.push(`unknown collection ${definition.collection}`);
  }
  for (const mood of definition.mood ?? []) {
    if (!THEME_MOODS.includes(mood)) issues.push(`unknown mood ${mood}`);
  }
  if (
    definition.contrastLevel !== undefined &&
    !THEME_CONTRAST_LEVELS.includes(definition.contrastLevel)
  ) {
    issues.push(`unknown contrast level ${definition.contrastLevel}`);
  }
  if (
    definition.density !== undefined &&
    (definition.density < 0.75 || definition.density > 1.25)
  ) {
    issues.push('density must be 0.75–1.25');
  }
  const style = ThemeStyleSchema.safeParse(definition.style ?? {});
  if (!style.success) issues.push(`style: ${style.error.message}`);
  return issues;
}

describe('library schema v2', () => {
  it('validates every definition: ids, hex seeds, fonts, neutrals, collections, moods and style', () => {
    const ids = LIBRARY_THEME_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    const failures = LIBRARY_THEME_DEFINITIONS.flatMap((definition) =>
      definitionIssues(definition).map((issue) => `${definition.id}: ${issue}`)
    );
    expect(failures).toEqual([]);
  });

  it('catches malformed definitions', () => {
    const base = LIBRARY_THEME_DEFINITIONS[0] as LibraryThemeDefinition;
    expect(
      definitionIssues({
        ...base,
        id: 'Bad Id',
        seed: 'teal',
        font: 'comic',
        collection: 'retro' as never,
        mood: ['grumpy' as never],
        contrastLevel: 'A' as never,
        style: { elevation: 'deep' as never },
      })
    ).toEqual([
      'id is not kebab-case',
      'seed teal is not #rrggbb',
      'unknown font comic',
      'unknown collection retro',
      'unknown mood grumpy',
      'unknown contrast level A',
      expect.stringMatching(/^style: /),
    ]);
  });

  it('fills the new metadata with defaults, so existing entries parse unchanged', () => {
    for (const meta of THEME_LIBRARY_META) {
      const definition = LIBRARY_THEME_DEFINITIONS.find((entry) => entry.id === meta.id);
      expect(meta.collection).toBe(definition?.collection ?? 'industry');
      expect(meta.mood).toEqual(definition?.mood ?? []);
      expect(meta.darkFirst).toBe(definition?.darkFirst ?? false);
      expect(meta.contrastLevel).toBe(definition?.contrastLevel ?? 'AA');
      expect(meta.neutral).toBe(definition?.neutral);
    }
  });

  it('holds every theme that claims AAA to 7:1 text contrast in both modes', async () => {
    const failures: string[] = [];
    for (const meta of THEME_LIBRARY_META.filter((entry) => entry.contrastLevel === 'AAA')) {
      const theme = await loadLibraryTheme(meta.id);
      for (const mode of ['light', 'dark'] as const) {
        for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
          const ratio = contrastRatio(theme[mode][fg], theme[mode][bg]);
          if (ratio < 7) failures.push(`${meta.id}/${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('searches case-insensitively, needs every word, and ranks name matches first', () => {
    expect(searchThemeLibrary('')).toBe(THEME_LIBRARY_META);
    expect(searchThemeLibrary('  ')).toBe(THEME_LIBRARY_META);
    expect(searchThemeLibrary('NEON')[0]?.id).toBe('gaming-neon');
    expect(searchThemeLibrary('dark contrast')[0]?.id).toBe('accessible-dark-contrast');
    expect(searchThemeLibrary('fintech')[0]?.id).toBe('fintech-ledger');
    expect(searchThemeLibrary('no-such-theme-anywhere')).toEqual([]);
    for (const result of searchThemeLibrary('ledger trust')) {
      const text = [
        result.name,
        result.id,
        result.description,
        result.category,
        result.collection,
        ...result.tags,
        ...result.mood,
      ]
        .join(' ')
        .toLowerCase();
      expect(text).toContain('ledger');
      expect(text).toContain('trust');
    }
    expect(searchThemeLibrary('studio').map((meta) => meta.id)).toEqual(
      searchThemeLibrary('Studio').map((meta) => meta.id)
    );
  });

  it('ranks a name match above a description-only match', () => {
    const results = searchThemeLibrary('ledger');
    const firstDescriptionOnly = results.findIndex(
      (meta) => !meta.name.toLowerCase().includes('ledger') && !meta.id.includes('ledger')
    );
    const lastNameMatch = results.reduce(
      (last, meta, index) =>
        meta.name.toLowerCase().includes('ledger') || meta.id.includes('ledger') ? index : last,
      -1
    );
    expect(lastNameMatch).toBeGreaterThanOrEqual(0);
    if (firstDescriptionOnly >= 0) expect(lastNameMatch).toBeLessThan(firstDescriptionOnly);
  });

  it('lists every collection in a fixed order with counts, and filters by collection and mood', () => {
    const collections = listCollections();
    expect(collections.map((entry) => entry.id)).toEqual([...THEME_COLLECTIONS]);
    expect(collections.reduce((sum, entry) => sum + entry.count, 0)).toBe(
      THEME_LIBRARY_META.length
    );
    expect(listThemeLibrary({ collection: 'industry' }).length).toBe(
      collections.find((entry) => entry.id === 'industry')?.count
    );
    for (const mood of THEME_MOODS) {
      expect(listThemeLibrary({ mood }).every((meta) => meta.mood.includes(mood))).toBe(true);
    }
  });

  it('passes the neutral family through to the palette engine', () => {
    const base = LIBRARY_THEME_DEFINITIONS[0] as LibraryThemeDefinition;
    const plain = themeFromDefinition({ ...base, neutral: undefined });
    const warm = themeFromDefinition({ ...base, neutral: 'warm' });
    expect(warm.light.background).not.toBe(plain.light.background);
    expect(warm.dark.surface).not.toBe(plain.dark.surface);
    expect(ThemeSchema.parse(warm)).toEqual(warm);
  });
});
