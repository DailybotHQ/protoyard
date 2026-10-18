import { ThemeSchema } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { contrastRatio, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from '../src/contrast.ts';
import {
  clearLibraryThemeCache,
  getLibraryThemeMeta,
  listThemeLibrary,
  loadAllLibraryThemes,
  loadLibraryTheme,
  THEME_LIBRARY_META,
} from '../src/library/index.ts';

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
