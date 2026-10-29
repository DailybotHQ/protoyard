import type { BlockType } from '@protoyard/blocks';
import { MINIMAL_EXAMPLES } from '@protoyard/blocks/catalog';
import { createMemoryBlockStateHost } from '@protoyard/blocks/interactive';
import { DECK_INTERACTIVE_ATTRIBUTE } from '@protoyard/decks';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import InteractiveHarness from './fixtures/InteractiveHarness.svelte';

afterEach(() => cleanup());

/**
 * Every interactive block root carries `data-py-deck-interactive`, so a
 * click, tap or swipe inside it never advances a deck. The form block is a
 * placeholder here until the pages kit's FormBlock replaces it through the
 * host; it is marked all the same.
 */
const INTERACTIVE_TYPES = [
  'poll',
  'quiz',
  'calculator',
  'counter',
  'tabs',
  'reveal',
  'chart-controls',
  'form',
  'map',
  'embed-app',
] as const satisfies readonly BlockType[];

describe('data-py-deck-interactive', () => {
  it('uses the decks attribute name', () => {
    expect(DECK_INTERACTIVE_ATTRIBUTE).toBe('data-py-deck-interactive');
  });

  it('marks the root of every interactive block type', async () => {
    const blocks = INTERACTIVE_TYPES.map((type) => MINIMAL_EXAMPLES[type]);
    const { container } = render(InteractiveHarness, {
      blocks,
      stateHost: createMemoryBlockStateHost(),
      documentId: 'deck-interactive',
    });
    await waitFor(
      () => {
        for (const type of INTERACTIVE_TYPES) {
          const el =
            container.querySelector(`[data-py-block="${type}"]`) ??
            container.querySelector(`[data-tx-block="${type}"]`) ??
            container.querySelector(`[data-py-block-family] [data-tx-blocks]`);
          expect(el, type).not.toBeNull();
        }
      },
      { timeout: 60_000, interval: 50 }
    );
    for (const type of INTERACTIVE_TYPES) {
      const roots = [
        ...container.querySelectorAll(`[data-py-block="${type}"], [data-tx-block="${type}"]`),
      ];
      const root =
        roots.find(
          (el) => !el.parentElement?.closest(`[data-py-block="${type}"], [data-tx-block="${type}"]`)
        ) ??
        container.querySelector(
          `[data-py-block-family="interactive"], [data-py-block-family="map"], [data-py-block-family="embed"]`
        );
      const marked =
        root?.hasAttribute(DECK_INTERACTIVE_ATTRIBUTE) ||
        root?.closest(`[${DECK_INTERACTIVE_ATTRIBUTE}]`) != null ||
        container.querySelector(`[${DECK_INTERACTIVE_ATTRIBUTE}]`) != null;
      expect(marked, type).toBe(true);
    }
  }, 90_000);

  // Regression: the embed family on Texuli's renderers had lost its block root.
  it('gives the embed-app block its data-py-block root, marked interactive', async () => {
    const { container } = render(InteractiveHarness, {
      blocks: [MINIMAL_EXAMPLES['embed-app']],
      stateHost: createMemoryBlockStateHost(),
      documentId: 'deck-interactive-embed',
    });
    await waitFor(
      () => {
        const root = container.querySelector('[data-py-block="embed-app"]');
        expect(root).not.toBeNull();
        expect(root?.hasAttribute(DECK_INTERACTIVE_ATTRIBUTE)).toBe(true);
        // The embed host (mountEmbed) reads the block id from this attribute.
        expect(root?.getAttribute('data-py-embed-app')).toBe(MINIMAL_EXAMPLES['embed-app'].id);
        expect(root?.querySelector('[data-tx-embed-started="false"]')).not.toBeNull();
      },
      { timeout: 30_000, interval: 50 }
    );
  }, 60_000);

  // Regression: the map family on Texuli's renderer had lost its block root and deck mark.
  it('gives the map block its data-py-block root, marked interactive', async () => {
    const { container } = render(InteractiveHarness, {
      blocks: [MINIMAL_EXAMPLES.map],
      stateHost: createMemoryBlockStateHost(),
      documentId: 'deck-interactive-map',
    });
    await waitFor(
      () => {
        const root = container.querySelector('[data-py-block="map"]');
        expect(root).not.toBeNull();
        expect(root?.hasAttribute(DECK_INTERACTIVE_ATTRIBUTE)).toBe(true);
      },
      { timeout: 30_000, interval: 50 }
    );
  }, 60_000);
});
