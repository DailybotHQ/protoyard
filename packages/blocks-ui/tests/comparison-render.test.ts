import { BLOCK_TYPE_FAMILY, BLOCK_TYPES, type BlockType } from '@protoyard/blocks';
import { BLOCK_CATALOG } from '@protoyard/blocks/catalog';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  familyLoaders as pageFamilyLoaders,
  resolvePageBlock,
} from '../../pages-ui/src/block-host/load-family.ts';
import { blockRendererRegistry, resolveBlockRenderer } from '../src/registry.ts';

/*
 * Every block type in the catalog reaches a real renderer, through both hosts
 * that route blocks: blocks-ui's own registry (BlockRenderer, decks) and the
 * pages-ui BlockHost loader (pages and docs). A comparison on the Tidewater
 * landing page once showed "Unsupported block": the mapping was right, but a
 * family chunk that failed to download was reported as unsupported. These
 * tests pin both: the routing is complete, and a failed download is retried
 * and then surfaces as a load error, never as an unsupported block.
 */

afterEach(cleanup);

// The first import of each family transforms its whole module graph; do it once,
// with a generous timeout, so per-type tests measure routing and not a cold start.
beforeAll(async () => {
  await Promise.all(Object.values(pageFamilyLoaders).map((load) => load()));
}, 180_000);

/** What a family dispatcher or host prints when it has no renderer for a block. */
const FALLBACK =
  /needs a newer Protoyard|not available yet|not supported yet|could not be displayed|Unsupported block/i;

const CATALOG_TYPES = Object.keys(BLOCK_CATALOG) as BlockType[];

describe('every catalog block type resolves to a renderer', () => {
  it('the catalog covers every block type', () => {
    expect([...CATALOG_TYPES].sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it.each(CATALOG_TYPES)('%s: the blocks-ui registry routes it to its declared family', (type) => {
    expect(blockRendererRegistry[type]?.family).toBe(BLOCK_TYPE_FAMILY[type]);
    expect(pageFamilyLoaders[BLOCK_TYPE_FAMILY[type]]).toBeTypeOf('function');
  });

  it.each(CATALOG_TYPES)(
    '%s: the minimal example renders through its family without a fallback',
    async (type) => {
      const example = BLOCK_CATALOG[type].exampleMinimal;
      const viaRegistry = await resolveBlockRenderer(example);
      expect(viaRegistry.kind, `${type} via blocks-ui`).toBe('render');
      const viaPages = await resolvePageBlock(example);
      expect(viaPages.kind, `${type} via pages-ui BlockHost`).toBe('render');
      if (viaRegistry.kind !== 'render') return;

      const view = render(viaRegistry.component, { props: { block: viaRegistry.block } });
      expect(view.container.textContent ?? '').not.toMatch(FALLBACK);
      expect(view.container.innerHTML.trim().length, `${type} renders markup`).toBeGreaterThan(0);
    },
    20_000
  );

  it('renders the Tidewater comparison as a table', async () => {
    const block = {
      type: 'comparison',
      columns: [{ label: 'Tidewater' }, { label: 'Supermarket bag' }],
      rows: [
        { label: 'Roast date on the bag', values: ['Yes', 'Rarely'] },
        { label: 'Days since roasting', values: ['2 to 5', '30 or more'] },
      ],
    };
    const resolved = await resolvePageBlock(block);
    expect(resolved.kind).toBe('render');
    if (resolved.kind !== 'render') return;
    expect(resolved.family).toBe('structure');
    const view = render(resolved.component, { props: { block: resolved.block } });
    expect(view.getByText('Roast date on the bag')).toBeTruthy();
    expect(view.getByText('30 or more')).toBeTruthy();
    expect(view.container.textContent).not.toMatch(FALLBACK);
  });
});

describe('a family chunk that fails to download', () => {
  const comparison = BLOCK_CATALOG.comparison.exampleMinimal;

  it('is retried once and then renders', async () => {
    const real = pageFamilyLoaders.structure;
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(real);
    const resolved = await resolvePageBlock(comparison, { ...pageFamilyLoaders, structure: flaky });
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(resolved.kind).toBe('render');
  });

  it('rejects after the retry, so BlockHost shows a retryable load error instead of "Unsupported block"', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      resolvePageBlock(comparison, { ...pageFamilyLoaders, structure: offline })
    ).rejects.toThrow('Failed to fetch');
    expect(offline).toHaveBeenCalledTimes(2);
  });
});
