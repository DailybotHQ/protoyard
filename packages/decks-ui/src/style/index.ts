/**
 * Deck style application: `DeckStyleState` resolves `deck.style` lazily (the
 * kit chunk holds themes and backgrounds), `DeckSlideFrame` paints one slide.
 */
export { default as DeckSlideFrame } from './DeckSlideFrame.svelte';
export {
  type DeckStyleContext,
  DeckStyleState,
  getDeckStyleContext,
  setDeckStyleContext,
} from './deck-style.svelte.ts';
export type { DeckMode, DeckStyleResolution, SlideSurface } from './kit.ts';
