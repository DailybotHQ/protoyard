/**
 * `@protoyard/blocks-ui/code` — thin adapter over `@texuli/blocks/code/renderers`.
 */

export { default as CodeBlock } from './CodeBlock.svelte';
export { default as BlockFamilyRenderer } from './CodeFamily.svelte';
export {
  activeHighlightIndex,
  CODE_TOKEN_STYLES,
  type CodeColorRole,
  type CodeTokenStyle,
} from './tokens.ts';
