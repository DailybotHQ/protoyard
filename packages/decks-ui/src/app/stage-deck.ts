import type { Deck, FreeSlide } from '@protoyard/decks/schema';
import { deckThemeKey } from '@protoyard/decks/style/key';

/**
 * The deck DeckApp hands the `@texuli/slides` stage.
 *
 * - **Theme:** `style.theme` becomes Protoyard's theme key (a theme id, a
 *   palette seed as `seed-<hex>`, or the default theme) with the font pair
 *   (`stageThemeKey`), which DeckApp's `loadTheme` resolves through
 *   `@protoyard/themes`.
 * - **Free slides** stay free slides: the stage checks their blocks with
 *   DeckApp's `validateBlock` (a typed-object check, see `renderers.ts`)
 *   and counts their steps itself. A free slide with no title takes its
 *   first heading's text, which the stage names the slide by. DeckApp's
 *   free-slide renderer paints the original `@protoyard/blocks` from
 *   `freeSlides`.
 */
/**
 * The theme key the stage loads and caches a theme by: the deck theme key,
 * plus `-font-<pair>` when the deck picks a font pairing. The stage caches
 * loaded themes by key, so a font pair change (Deck Studio) must change the
 * key or the stage keeps the old fonts. Both parts are slugs, so the key is
 * still a valid catalog theme id for the deck model.
 */
export function stageThemeKey(style: Deck['style'] | undefined): string {
  const theme = deckThemeKey(style);
  return style?.fontPair ? `${theme}-font-${style.fontPair}` : theme;
}

/** The deck theme key inside a stage theme key, given the font pair the deck has now. */
export function themeKeyOf(stageKey: string, fontPair: string | undefined): string {
  const suffix = fontPair ? `-font-${fontPair}` : '';
  return suffix && stageKey.endsWith(suffix) ? stageKey.slice(0, -suffix.length) : stageKey;
}

export interface StageDeck {
  input: Record<string, unknown>;
  /** The original free slides, by id, for the free-slide renderer. */
  freeSlides: ReadonlyMap<string, FreeSlide>;
}

export function stageDeck(deck: Deck): StageDeck {
  const freeSlides = new Map<string, FreeSlide>();
  const slides = deck.slides.map((slide) => {
    if (slide.layout !== 'free') return slide;
    const free = slide as FreeSlide;
    freeSlides.set(free.id, free);
    if (free.title) return free;
    // The stage names the slide by its title: keep the first heading as one when it has none.
    const heading = free.blocks.find((block) => block.type === 'heading');
    return heading && 'text' in heading
      ? { ...free, title: String(heading.text).slice(0, 160) }
      : free;
  });
  const { paletteSeed: _seed, ...style } = deck.style ?? {};
  return {
    input: { ...deck, style: { ...style, theme: stageThemeKey(deck.style) }, slides },
    freeSlides,
  };
}
