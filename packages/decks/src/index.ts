export {
  DECK_ASPECTS,
  DECK_TEXT_MINIMUMS,
  DEFAULT_DECK_ASPECT,
  type DeckAspect,
  type DeckCanvasSize,
  deckCanvasSize,
  isDeckAspect,
} from './canvas.ts';
export {
  createDeckNavigator,
  DECK_HASH_ID_MAX,
  DECK_HASH_STEP_MAX,
  type DeckHashLocation,
  type DeckLocation,
  type DeckNavigator,
  type DeckNavigatorOptions,
  defaultSlideStepCount,
  formatDeckHash,
  parseDeckHash,
  type SlideStepCountResolver,
} from './navigation/index.ts';
