/**
 * Step positions for deck navigation. A slide starts at step 0 (its initial
 * state) and has one more position per authored step: the advances that
 * `slideStepCount` derives from block steps, code highlights, catalog prop
 * markers and `slide.steps` labels (labels name steps 1, 2, 3…). So a slide
 * with N advances has N + 1 positions, `#/<id>/0` … `#/<id>/<N>`, and the last
 * one is always reachable.
 */

import { slideStepCount } from '../motion/steps.ts';
import { DECK_LIMITS, type DeckSlide } from '../schema/index.ts';

/** How many navigable step positions a slide has (always ≥ 1). */
export type SlideStepCountResolver = (slide: DeckSlide) => number;

/** Positions on a slide: its initial state plus one per advance (1 + `slideStepCount`). */
export function slidePositionCount(slide: DeckSlide): number {
  return 1 + Math.min(DECK_LIMITS.steps, Math.max(0, slideStepCount(slide)));
}

/**
 * The navigator's default resolver, kept as the public name. It is
 * {@link slidePositionCount}: before steps were derived from fragments it
 * counted only `slide.steps` labels, one position per label, which left the
 * last labelled step unreachable.
 */
export function defaultSlideStepCount(slide: DeckSlide): number {
  return slidePositionCount(slide);
}
