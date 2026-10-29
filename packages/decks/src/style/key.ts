import type { DeckStyle } from '../schema/index.ts';

/**
 * The id of `@protoyard/themes`' default theme (`DEFAULT_THEME_ID`), kept
 * here so a deck entry can name its theme without loading the theme
 * registry (`tests/style.test.ts` checks they agree).
 */
export const DEFAULT_DECK_THEME_ID = 'violet';

/**
 * The theme key a deck asks the stage for: `seed-<8 hex digits>` for a
 * palette seed, else the theme id, else the default theme. Always a slug, so
 * it is a valid catalog theme id for the deck model.
 */
export function deckThemeKey(style: DeckStyle | undefined): string {
  if (style?.paletteSeed !== undefined) {
    return `seed-${(style.paletteSeed >>> 0).toString(16).padStart(8, '0')}`;
  }
  return style?.theme ?? DEFAULT_DECK_THEME_ID;
}
