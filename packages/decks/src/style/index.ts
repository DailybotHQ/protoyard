import {
  createThemeFromSeed,
  findTheme,
  getFontPairing,
  getLibraryThemeMeta,
  getTheme,
  loadLibraryTheme,
} from '@protoyard/themes';
import type { toTexuliTheme } from '@protoyard/themes/texuli';

export { DEFAULT_DECK_THEME_ID, deckThemeKey } from './key.ts';

/**
 * `@protoyard/decks/style`: how a Protoyard deck's `style.theme`,
 * `style.paletteSeed` and `style.fontPair` become the theme the
 * `@texuli/slides` stage paints with. The stage applies the theme, density,
 * radius, motion, backgrounds, logo, footer, numbering and progress itself
 * (`@texuli/deck` style resolution); Protoyard resolves only its own theme
 * ids (the six built-ins, the 64-theme library and palette seeds) and font
 * pairings, through `@protoyard/themes`, so a deck looks the same in the
 * player and in a generated prototype.
 */

/** A Protoyard theme (`@protoyard/themes`). */
type Theme = ReturnType<typeof getTheme>;

/** A Texuli theme (`@texuli/tokens/contract`), as `toTexuliTheme` returns it. */
export type DeckTexuliTheme = ReturnType<typeof toTexuliTheme>;

export type DeckStyleWarningCode = 'unknown-theme' | 'unknown-font-pair';

export interface DeckStyleWarning {
  code: DeckStyleWarningCode;
  message: string;
  value: string;
}

const SEED_KEY = /^seed-([0-9a-f]{8})$/;

async function resolveTheme(key: string, warnings: DeckStyleWarning[]): Promise<Theme> {
  const seed = SEED_KEY.exec(key);
  if (seed) {
    return createThemeFromSeed({
      id: `deck-seed-${Number.parseInt(seed[1] as string, 16).toString(16)}`,
      name: 'Deck palette',
      seed: `#${(seed[1] as string).slice(-6)}`,
    });
  }
  const builtin = findTheme(key);
  if (builtin) return builtin;
  if (getLibraryThemeMeta(key)) return loadLibraryTheme(key);
  warnings.push({
    code: 'unknown-theme',
    value: key,
    message: `Unknown theme "${key}"; using the default theme.`,
  });
  return getTheme(undefined);
}

export interface LoadedDeckTheme {
  theme: DeckTexuliTheme;
  warnings: DeckStyleWarning[];
}

/**
 * Resolve a theme key ({@link deckThemeKey}) and an optional font pairing to
 * the Texuli theme the stage applies. Unknown ids fall back to the default
 * theme and unknown font pairings to the theme's own fonts, each with a
 * warning (the deck still opens).
 */
export async function loadDeckTheme(key: string, fontPair?: string): Promise<LoadedDeckTheme> {
  const warnings: DeckStyleWarning[] = [];
  const base = await resolveTheme(key, warnings);
  const pairing = fontPair ? getFontPairing(fontPair) : undefined;
  if (fontPair && !pairing) {
    warnings.push({
      code: 'unknown-font-pair',
      value: fontPair,
      message: `Unknown font pairing "${fontPair}"; using the theme font pairing.`,
    });
  }
  const theme: Theme = pairing
    ? {
        ...base,
        fontFamily: pairing.fontFamily,
        fontFamilyHeading: pairing.fontFamilyHeading,
        fontFamilyMono: pairing.fontFamilyMono,
      }
    : base;
  const { toTexuliTheme: convert } = await import('@protoyard/themes/texuli');
  return { theme: convert(theme), warnings };
}
