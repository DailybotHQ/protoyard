import type { BlockFamily } from '@protoyard/blocks';
import { blockRendererRegistry, loadBlockFamily } from '@protoyard/blocks-ui';
import type { DeckSlide } from '@protoyard/decks/schema';

/**
 * Idle prefetch of the code a slide will need: its layout family and, on a
 * free slide, the block families of every block (nested ones included). The
 * deck already mounts the next slide, so DeckApp prefetches the slides after
 * it during idle time and a step never waits on a lazy chunk. This module is
 * itself lazy, and shares as little as it can with the deck entry: DeckApp
 * passes in its layout loader, and blocks are walked here.
 */

export interface PrefetchLoaders {
  layout: (layout: string) => Promise<unknown>;
  family: (family: BlockFamily) => Promise<unknown>;
}

/** Every block type in a block list, nested containers (columns, tabs, reveal) included. */
function blockTypes(blocks: unknown, into: Set<string>, depth = 0): void {
  if (!Array.isArray(blocks) || depth > 8) return;
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue;
    const record = block as Record<string, unknown>;
    if (typeof record.type === 'string') into.add(record.type);
    blockTypes(record.blocks, into, depth + 1);
    if (Array.isArray(record.columns))
      for (const column of record.columns) blockTypes(column, into, depth + 1);
    if (Array.isArray(record.panels)) {
      for (const panel of record.panels)
        blockTypes((panel as { blocks?: unknown }).blocks, into, depth + 1);
    }
  }
}

/** The layout and block families a slide renders with. */
export function slideCode(slide: DeckSlide): { layout: string | null; families: BlockFamily[] } {
  if (slide.layout === 'custom') return { layout: null, families: [] };
  const types = new Set<string>();
  if ('blocks' in slide) blockTypes(slide.blocks, types);
  const families = new Set<BlockFamily>();
  for (const type of types) {
    const family = (blockRendererRegistry as Record<string, { family: BlockFamily } | undefined>)[
      type
    ]?.family;
    if (family) families.add(family);
  }
  return { layout: slide.layout, families: [...families] };
}

/** Starts loading what `slides` need; failures are ignored (the slide loads it again when shown). */
export function prefetchSlides(
  slides: readonly DeckSlide[],
  layout: PrefetchLoaders['layout'],
  family: PrefetchLoaders['family'] = loadBlockFamily
): Promise<void> {
  const loaders: PrefetchLoaders = { layout, family };
  const layouts = new Set<string>();
  const families = new Set<BlockFamily>();
  for (const slide of slides) {
    const code = slideCode(slide);
    if (code.layout) layouts.add(code.layout);
    for (const family of code.families) families.add(family);
  }
  return Promise.allSettled([
    ...[...layouts].map((layout) => loaders.layout(layout)),
    ...[...families].map((family) => loaders.family(family)),
  ]).then(() => undefined);
}
