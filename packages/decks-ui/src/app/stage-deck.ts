import type { Deck, FreeSlide } from '@protoyard/decks/schema';
import { deckThemeKey } from '@protoyard/decks/style/key';

/**
 * The deck DeckApp hands the `@texuli/slides` stage.
 *
 * - **Theme:** `style.theme` becomes Protoyard's theme key (a theme id, a
 *   palette seed as `seed-<hex>`, or the default theme), which DeckApp's
 *   `loadTheme` resolves through `@protoyard/themes`.
 * - **Free slides** stay free slides: the stage checks their blocks with
 *   DeckApp's `validateBlock` (Protoyard's block schema, see `renderers.ts`)
 *   and counts their steps itself. A free slide with no title takes its
 *   first heading's text, which the stage names the slide by. DeckApp's
 *   free-slide renderer paints the original `@protoyard/blocks` from
 *   `freeSlides`.
 */
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
    input: { ...deck, style: { ...style, theme: deckThemeKey(deck.style) }, slides },
    freeSlides,
  };
}
