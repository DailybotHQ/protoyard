import type { Block, BlockFamily } from '@protoyard/blocks';
import type { Component } from 'svelte';

/** Props every blocks-ui family dispatcher accepts. */
export interface BlockFamilyRendererProps {
  block: Block;
}

export type BlockFamilyRenderer = Component<BlockFamilyRendererProps>;

interface FamilyModule {
  BlockFamilyRenderer?: BlockFamilyRenderer;
}

/**
 * Lazy loaders for `@protoyard/blocks-ui/<family>`. Each import is a separate
 * chunk so page/doc entry graphs do not pull every family.
 */
const familyLoaders: Record<BlockFamily, () => Promise<FamilyModule>> = {
  text: () => import('@protoyard/blocks-ui/text'),
  media: () => import('@protoyard/blocks-ui/media'),
  data: () => import('@protoyard/blocks-ui/data'),
  structure: () => import('@protoyard/blocks-ui/structure'),
  code: () => import('@protoyard/blocks-ui/code'),
  diagram: () => import('@protoyard/blocks-ui/diagram'),
  interactive: () => import('@protoyard/blocks-ui/interactive'),
  map: () => import('@protoyard/blocks-ui/map'),
  embed: () => import('@protoyard/blocks-ui/embed'),
};

export type BlockHostResolution =
  | { kind: 'render'; block: Block; family: BlockFamily; component: BlockFamilyRenderer }
  | { kind: 'unknown'; message: string }
  | { kind: 'unavailable'; message: string; family?: BlockFamily };

/**
 * Resolve a typed or untrusted block to a family renderer. Never throws for
 * unknown shapes — returns a safe placeholder kind instead. Rejects only when
 * the family chunk cannot be downloaded, even after one retry.
 */
export async function resolvePageBlock(
  input: unknown,
  loaders: typeof familyLoaders = familyLoaders
): Promise<BlockHostResolution> {
  const { BLOCK_TYPE_FAMILY, safeParseBlock } = await import('@protoyard/blocks');
  const parsed = safeParseBlock(input);
  if (!parsed.success) {
    return {
      kind: 'unknown',
      message: 'This block could not be read. It may need a newer Protoyard.',
    };
  }
  const block = parsed.data;
  const family = BLOCK_TYPE_FAMILY[block.type];
  if (!family) {
    return {
      kind: 'unknown',
      message: `Block type "${block.type}" is not supported yet.`,
    };
  }
  const load = loaders[family];
  if (!load) {
    return {
      kind: 'unknown',
      message: `No renderer family is registered for "${block.type}".`,
    };
  }
  // A failed import is a download problem (offline, a reset connection, a
  // redeploy), not an unsupported block: retry once, then throw so BlockHost
  // shows its retryable "Block failed to load" state.
  const module = await loadWithRetry(load);
  if (typeof module.BlockFamilyRenderer !== 'function') {
    return {
      kind: 'unavailable',
      family,
      message: 'This block renderer is not available yet.',
    };
  }
  return {
    kind: 'render',
    block,
    family,
    component: module.BlockFamilyRenderer,
  };
}

/** Runs a family import, and once more after a failure. The second error propagates. */
export async function loadWithRetry<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch {
    return load();
  }
}

export { familyLoaders };
