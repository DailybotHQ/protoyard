/**
 * `@protoyard/decks-ui/debug` — the "Debug for agents" panel (ADR-038 lazy
 * chunk): DeckApp imports it only when the panel opens, so it adds nothing to
 * the deck entry. Availability (`deckDebugAvailable`) lives in
 * `./availability.ts`, which the entry imports directly.
 */
export {
  type DeckDebugContext,
  type DeckDebugSetting,
  debugQueryOn,
  deckDebugAvailable,
  isDevBuild,
} from './availability.ts';
export { default as BlockOutline } from './BlockOutline.svelte';
export { default as DeckDebugPanel } from './DeckDebugPanel.svelte';
export { deckFileName, downloadText, inertJson } from './format.ts';
