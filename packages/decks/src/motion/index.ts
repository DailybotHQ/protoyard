/**
 * `@protoyard/decks` motion: steps, fragments and transitions are the deck
 * model's (`@texuli/deck/model`). `slideSteps` and `slideStepCount` read a
 * Protoyard slide with its layout's steppable prop paths.
 */
import {
  layoutSteppablePaths,
  slideSteps as modelSlideSteps,
  type SlideSteps,
} from '@texuli/deck/model';
import type { DeckSlide } from '../schema/index.ts';

export {
  activeCodeHighlight,
  DECK_TRANSITIONS,
  DEFAULT_MOTION,
  DEFAULT_TRANSITION,
  type DeckTransition,
  effectiveMotion,
  FRAGMENT_EFFECTS,
  type FragmentEffect,
  type FragmentPhase,
  fragmentPhase,
  MAX_MOTION_MS,
  type MotionLevel,
  REDUCED_FADE_MS,
  type ResolvedFragmentMotion,
  type ResolvedTransition,
  resolveDeckTransitions,
  resolveFragmentMotion,
  resolveSlideTransition,
  type SlideFragment,
  type SlideStep,
  type SlideSteps,
  slideFragments,
  type TransitionReason,
} from '@texuli/deck/model';

/** The steps of a slide: its stepped blocks, prop markers, code highlights and labels. */
export function slideSteps(slide: DeckSlide): SlideSteps {
  return modelSlideSteps(slide, { steppablePaths: layoutSteppablePaths(slide.layout) });
}

/** How many advances a slide takes before the deck moves on (its last step). */
export function slideStepCount(slide: DeckSlide): number {
  return slideSteps(slide).count;
}
