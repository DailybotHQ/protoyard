/**
 * The lazy authoring chunk behind `loadAuthoringApis()` (see `index.ts`).
 *
 * Keep this a separate module: a dynamic `import()` of modules that the root
 * entry also re-exports statically would pull them into the importer's first
 * chunk, while a dynamic import of this file keeps them, and the deck layout
 * catalog, in a chunk of their own.
 */

export {
  DECK_LAYOUTS as deckLayouts,
  describeLayouts as describeDeckLayouts,
  getDeckLayout,
} from '@protoyard/decks/layouts';
export { lintDeckStructure } from './authoring/deck-lint.ts';
export { propsForSelectedLayout, selectDeckLayouts } from './authoring/index.ts';
export { validateBlueprintForAuthoring } from './authoring-validation.ts';
export {
  blueprintFromBrief,
  buildDocOutline,
  buildPageOutline,
  detectBriefKind,
  synthesizeContentFromBrief,
  synthesizeDeckOutline,
} from './brief/index.ts';
