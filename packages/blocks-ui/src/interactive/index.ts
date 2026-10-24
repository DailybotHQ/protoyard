/**
 * `@protoyard/blocks-ui/interactive` — host-backed interactive blocks
 * (poll, quiz, calculator, tabs/reveal, counter, chart-controls, form).
 *
 * Texuli ships ephemeral poll/quiz/calculator/checklist renderers
 * (`@texuli/blocks/interactive/renderers`). Protoyard decks need
 * `BlockStateHost.dispatch` for shared viewer state, so this family keeps
 * thin host adapters over `@protoyard/blocks/interactive` reducers. New
 * ephemeral-only hosts may import Texuli directly.
 */
export { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
export { default as BlockFamilyRenderer } from './BlockFamilyRenderer.svelte';
export { formatUnitValue } from './format.ts';
