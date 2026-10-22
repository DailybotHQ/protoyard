import type { DeckSlide } from '@protoyard/decks/schema';
import { describe, expect, it, vi } from 'vitest';
import { prefetchSlides, slideCode } from '../src/app/prefetch.ts';
import { buildDeckEntry, cleanupDeckBuild, initialChunks } from './bundle-support.ts';

/**
 * T-perf: what first paint does not need stays off the deck entry (the help
 * dialog, full screen overlay, first-visit hint, More menu, slide list,
 * custom-slide host, debug panel and the idle prefetcher), and the idle
 * prefetch loads the code of the slides ahead.
 */

const LAZY_MODULES = [
  'decks-ui/src/chrome/KeyboardHelp.svelte',
  'decks-ui/src/chrome/FullscreenOverlay.svelte',
  'decks-ui/src/chrome/FirstRunHint.svelte',
  'decks-ui/src/chrome/MoreMenu.svelte',
  'decks-ui/src/chrome/SlideJumpList.svelte',
  'decks-ui/src/layouts/CustomSlideHost.svelte',
  'decks-ui/src/debug/DeckDebugPanel.svelte',
  'decks-ui/src/app/prefetch.ts',
  'blocks-ui/src/data/InteractiveTable.svelte',
];

describe('lazy deck chrome', () => {
  it('keeps every tool first paint does not need off the entry', async () => {
    const { dir, output } = await buildDeckEntry();
    try {
      const initial = initialChunks(output).flatMap((chunk) => Object.keys(chunk.modules));
      for (const module of LAZY_MODULES) {
        expect(
          initial.some((id) => id.replaceAll('\\', '/').includes(module)),
          `${module} is on the deck entry`
        ).toBe(false);
      }
    } finally {
      await cleanupDeckBuild(dir);
    }
  }, 120_000);
});

describe('idle prefetch', () => {
  const free = {
    id: 'free',
    layout: 'free',
    blocks: [
      { type: 'heading', text: 'A heading', level: 2 },
      {
        type: 'columns',
        widths: 'equal',
        columns: [
          [{ type: 'table', caption: 'Plans', columns: [{ label: 'Plan' }], rows: [['Team']] }],
          [
            {
              type: 'poll',
              id: 'p',
              question: 'Which?',
              options: [
                { id: 'a', label: 'A' },
                { id: 'b', label: 'B' },
              ],
            },
          ],
        ],
      },
    ],
  } as unknown as DeckSlide;
  const catalog = { id: 'cards', layout: 'three-column-cards', props: {} } as unknown as DeckSlide;
  const custom = {
    id: 'live',
    layout: 'custom',
    props: { component: 'probe' },
  } as unknown as DeckSlide;

  it('names a slide layout and every block family, nested ones included', () => {
    expect(slideCode(catalog)).toEqual({ layout: 'three-column-cards', families: [] });
    const code = slideCode(free);
    expect(code.layout).toBe('free');
    expect([...code.families].sort()).toEqual(['data', 'interactive', 'structure', 'text']);
    // A custom slide's code belongs to the prototype: nothing to prefetch here.
    expect(slideCode(custom)).toEqual({ layout: null, families: [] });
  });

  it('loads each layout and family once, and survives a failed load', async () => {
    const layout = vi.fn(async (_id: string) => null);
    const family = vi.fn(async (name: string) => {
      if (name === 'data') throw new Error('offline');
      return null;
    });
    await expect(prefetchSlides([catalog, free, free], layout, family)).resolves.toBeUndefined();
    expect(layout.mock.calls.map(([id]) => id).sort()).toEqual(['free', 'three-column-cards']);
    expect(family.mock.calls.map(([id]) => id).sort()).toEqual([
      'data',
      'interactive',
      'structure',
      'text',
    ]);
  });
});
