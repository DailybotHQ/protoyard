/**
 * `@protoyard/decks` backgrounds: Protoyard's zod schema and offline media
 * policy over the deck model's presets, resolver and contrast math
 * (`@texuli/deck/model`).
 */
export {
  chooseInk,
  compositeOver,
  DECK_TEXT_CONTRAST_MIN,
  type InkChoice,
  type ResolvedDeckBackground,
  resolveDeckBackground,
  sampleGradient,
  worstContrast,
} from '@texuli/deck/model';
export {
  checkDeckMediaSrc,
  DECK_IMAGE_TYPES,
  DECK_MEDIA_DATA_URI_MAX,
  DECK_MEDIA_PATH_MAX,
  DECK_VIDEO_TYPES,
  type DeckMediaCheck,
  type DeckMediaKind,
} from './media.ts';
export {
  DECK_BACKGROUND_PRESET_IDS,
  DECK_BACKGROUND_PRESETS,
  DECK_GRADIENT_IDS,
  DECK_GRADIENTS,
  DECK_PATTERNS,
  DECK_SOLID_TOKENS,
  DEFAULT_DECK_BACKGROUND,
  type DeckBackground,
  type DeckBackgroundPalette,
  type DeckBackgroundPresetId,
  DeckBackgroundSchema,
  type DeckBackgroundSpec,
  DeckBackgroundSpecSchema,
  type DeckGradient,
  type DeckPattern,
  type DeckSolidToken,
} from './schema.ts';
