/**
 * `@protoyard/blocks-ui/interactive` — poll, quiz, calculator, tabs/reveal,
 * counter, chart-controls and form blocks. State changes go only through
 * BlockStateHost.dispatch (never the database package or Dexie).
 */
export { default as BlockFamilyRenderer } from './BlockFamilyRenderer.svelte';
export { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
export { formatUnitValue } from './format.ts';
