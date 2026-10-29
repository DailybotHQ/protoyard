export {
  applyDeckEdits,
  compatibleLayouts,
  DECK_STUDIO_SLIDE_KEYS,
  DECK_STUDIO_STYLE_KEYS,
  type DeckStudioEdits,
  type DeckStudioResult,
  type DeckStudioSlideKey,
  type DeckStudioStyleKey,
  deckEditsToPatch,
} from './edits.ts';
export {
  applyDeckPatch,
  DECK_PATCH_MAX_OPS,
  DeckPatchError,
  type DeckPatchOperation,
  formatPointer,
  jsonEquals,
  parsePointer,
} from './json-patch.ts';
export { deckStudioOptions } from './options.ts';
