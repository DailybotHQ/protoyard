import { DEFAULT_THEME_ID, FONT_CATALOG, THEME_LIBRARY_META } from '@protoyard/themes';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_THEME_ID, deckThemeKey, loadDeckTheme } from '../src/style/index.ts';

/**
 * Protoyard theme ids, palette seeds and font pairings become the Texuli
 * theme the stage paints with. The stage resolves the rest of `style`
 * (density, radius, motion, backgrounds, footer…) with `@texuli/deck`.
 */
describe('deck theme keys', () => {
  it('names the theme id, a palette seed or the default theme', () => {
    expect(DEFAULT_DECK_THEME_ID).toBe(DEFAULT_THEME_ID);
    expect(deckThemeKey(undefined)).toBe(DEFAULT_THEME_ID);
    expect(deckThemeKey({ theme: 'ocean' })).toBe('ocean');
    // A seed wins over a theme id, as it did in Protoyard decks.
    expect(deckThemeKey({ theme: 'ocean', paletteSeed: 0x12ab34 })).toBe('seed-0012ab34');
    expect(deckThemeKey({ paletteSeed: 0xffff_ffff })).toBe('seed-ffffffff');
  });
});

describe('loadDeckTheme', () => {
  it('resolves built-in and library themes to Texuli themes', async () => {
    const builtin = await loadDeckTheme('ocean');
    expect(builtin.warnings).toEqual([]);
    expect(builtin.theme.light.primary.default).toMatch(/^#[0-9a-f]{6}$/i);
    const library = THEME_LIBRARY_META[0];
    if (!library) throw new Error('The theme library is empty.');
    const loaded = await loadDeckTheme(library.id);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.theme.dark.background.default).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('creates deterministic palette themes from unsigned seeds', async () => {
    const a = await loadDeckTheme('seed-0012ab34');
    const b = await loadDeckTheme('seed-0012ab34');
    expect(a.theme).toEqual(b.theme);
    expect(a.warnings).toEqual([]);
    expect((await loadDeckTheme('seed-00ff0000')).theme.light.primary.default).not.toBe(
      a.theme.light.primary.default
    );
  });

  it('applies a font pairing to the theme', async () => {
    const pairing = FONT_CATALOG.find((font) => font.id === 'geometric') ?? FONT_CATALOG[0];
    if (!pairing) throw new Error('The font catalog is empty.');
    const { theme } = await loadDeckTheme('ocean', pairing.id);
    expect(theme.fontFamily).toBe(pairing.fontFamily);
    expect(theme.fontFamilyMono).toBe(pairing.fontFamilyMono);
  });

  it('falls back with warnings for unknown theme and font ids', async () => {
    const result = await loadDeckTheme('no-such-theme', 'no-such-font');
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'unknown-theme',
      'unknown-font-pair',
    ]);
    expect((await loadDeckTheme(DEFAULT_THEME_ID)).theme).toEqual(result.theme);
  });
});
