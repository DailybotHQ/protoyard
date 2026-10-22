/**
 * `@protoyard/blocks-ui/code` — code blocks: tokens from
 * `@protoyard/blocks/code` drawn as text spans in theme-token colors (AA on
 * the code surface in every built-in theme), a copy button, a focusable
 * scroller and stepped line highlights driven by the host's deck step.
 */

export { default as CodeBlock } from './CodeBlock.svelte';
export { default as BlockFamilyRenderer } from './CodeFamily.svelte';
export {
  activeHighlightIndex,
  CODE_TOKEN_STYLES,
  type CodeColorRole,
  type CodeTokenStyle,
} from './tokens.ts';
