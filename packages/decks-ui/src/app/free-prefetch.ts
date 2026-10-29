import { blockRendererRegistry } from '@protoyard/blocks-ui';
import type { FreeSlide } from '@protoyard/decks/schema';

const BLOCK_TYPES: ReadonlySet<string> = new Set(Object.keys(blockRendererRegistry));

/** Load the block families a free slide needs (lazy: this module is its own chunk). */
export function prefetchFreeSlide(slide: FreeSlide): Promise<unknown> {
  const families = new Set<() => Promise<unknown>>();
  for (const block of slide.blocks) {
    const type = (block as { type?: unknown }).type;
    if (typeof type !== 'string' || !BLOCK_TYPES.has(type)) continue;
    families.add(blockRendererRegistry[type as keyof typeof blockRendererRegistry].load);
  }
  return Promise.all([...families].map((load) => load()));
}
