/**
 * Step-count interface for deck navigation. DECKS-steps-motion will derive
 * richer step lists from layout props and block fragments; navigation only
 * needs how many positions each slide has.
 */

import type { DeckSlide } from '../schema/index.ts';

/** How many navigable step positions a slide has (always ≥ 1). */
export type SlideStepCountResolver = (slide: DeckSlide) => number;

/**
 * Default step count from the slide's explicit `steps` labels.
 * An empty or missing list means a single position (the base slide).
 */
export function defaultSlideStepCount(slide: DeckSlide): number {
  const labels = slide.steps;
  if (!labels || labels.length === 0) return 1;
  return Math.min(32, Math.max(1, labels.length));
}
