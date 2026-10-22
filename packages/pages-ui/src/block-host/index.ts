/**
 * `@protoyard/pages-ui/block-host` — lazy single-block host for page and doc
 * surfaces. Delegates to `@protoyard/blocks-ui/<family>` chunks.
 */
export { default as BlockHost } from './BlockHost.svelte';
export {
  type BlockFamilyRenderer,
  type BlockFamilyRendererProps,
  type BlockHostResolution,
  familyLoaders,
  resolvePageBlock,
} from './load-family.ts';
export { default as UnknownBlock } from './UnknownBlock.svelte';
