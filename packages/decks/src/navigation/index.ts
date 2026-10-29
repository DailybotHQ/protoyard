/**
 * `@protoyard/decks` navigation: the deck engine's navigator and hash routes
 * (`#/<slide-id>/<step>`), from `@texuli/deck/engine`. The navigator reads a
 * Protoyard deck as is (its slides, `hidden`, `steps` and outline).
 */
import { layoutSteppablePaths, slideSteps } from '@texuli/deck/model';
import type { DeckSlide } from '../schema/index.ts';

export {
  createDeckNavigator,
  DECK_HASH_ID_MAX,
  DECK_HASH_STEP_MAX,
  type DeckHashLocation,
  type DeckLocation,
  type DeckNavigator,
  formatDeckHash,
  type NavigatorOptions as DeckNavigatorOptions,
  parseDeckHash,
  parseDeckRoute,
} from '@texuli/deck/engine';

/**
 * Positions on a slide: the initial state plus one per advance, so a slide
 * with N steps has N + 1 positions (`#/<id>/0` … `#/<id>/N`).
 */
export function slidePositionCount(slide: DeckSlide): number {
  return slideSteps(slide, { steppablePaths: layoutSteppablePaths(slide.layout) }).count + 1;
}
