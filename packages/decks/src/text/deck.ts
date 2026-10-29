/**
 * Text twins of a deck: `deckToMarkdown` (a readable Markdown document for
 * accessibility, artifact descriptions and LLM context) and `deckOutline`
 * (one compact row per slide). They are `@texuli/deck`'s twins
 * (`deckToText`, `deckOutline`) on the migrated deck: pure and deterministic,
 * the same deck always gives the same text.
 */
import {
  type DeckOutlineSlide,
  type DeckOutlineText,
  deckToText,
  formatDeckOutline,
  deckOutline as modelOutline,
  slideTitle as modelSlideTitle,
} from '@texuli/deck/markdown';
import type { DeckSlide as ModelSlide } from '@texuli/deck/model';
import type { Deck, DeckSlide } from '../schema/index.ts';
import { toTexuliDeck } from '../texuli.ts';

export { type DeckOutlineSlide, type DeckOutlineText, formatDeckOutline };

export interface DeckTextOptions {
  /** Document title when the deck outline has none. Default: the deck's derived title. */
  title?: string;
  /** Include slides marked `hidden`. Default false. */
  includeHidden?: boolean;
  /** Include speaker notes under a "Notes" heading. Default true. */
  notes?: boolean;
}

/** The slide's title: its own `title`, else the first heading it shows. */
export function slideTitle(slide: DeckSlide): string | null {
  return modelSlideTitle(slide as unknown as ModelSlide);
}

/** The deck as a readable Markdown document (text only: no HTML, no scripts). */
export function deckToMarkdown(deck: Deck, options: DeckTextOptions = {}): string {
  return deckToText(toTexuliDeck(deck), options);
}

/** One row per slide: number, id, layout, title, hidden. */
export function deckOutline(
  deck: Deck,
  options: Pick<DeckTextOptions, 'includeHidden'> = {}
): DeckOutlineText {
  return modelOutline(toTexuliDeck(deck), options);
}
