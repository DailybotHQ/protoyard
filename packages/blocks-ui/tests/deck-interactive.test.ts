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
          expect(container.querySelector(`[data-py-block="${type}"]`), type).not.toBeNull();
        }
      },
      { timeout: 60_000, interval: 50 }
    );
    for (const type of INTERACTIVE_TYPES) {
      const roots = [...container.querySelectorAll(`[data-py-block="${type}"]`)];
      // The outermost element of the block is the one the deck checks with closest().
      const root = roots.find((el) => !el.parentElement?.closest(`[data-py-block="${type}"]`));
      expect(root?.hasAttribute(DECK_INTERACTIVE_ATTRIBUTE), type).toBe(true);
    }
  }, 90_000);
});
