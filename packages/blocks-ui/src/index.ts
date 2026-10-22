/** Small entry point for rendering a block list without importing a family. */
export type { BlockFamily, BlockTone } from '@protoyard/blocks';
export { default as BlockRenderer } from './BlockRenderer.svelte';
export {
  type BlockCanvasMode,
  type BlockCtaAction,
  type BlockDensity,
  type BlockHost,
  type BlockHostOptions,
  getBlockHost,
  type MountEmbed,
  setBlockHost,
} from './host.ts';
