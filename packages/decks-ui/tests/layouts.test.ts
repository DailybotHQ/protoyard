import { DECK_INTERACTIVE_ATTRIBUTE } from '@protoyard/decks';
import { DECK_LAYOUTS } from '@protoyard/decks/layouts';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeLayout, deckInputGuardAttributes } from '../src/layouts/compose.ts';
import { loadLayoutRenderer } from '../src/layouts/registry.ts';

function flatten(
  blocks: readonly import('@protoyard/blocks').Block[]
): import('@protoyard/blocks').Block[] {
  return blocks.flatMap((block) => [
    block,
    ...(block.type === 'columns'
      ? flatten(block.columns.flat())
      : block.type === 'tabs'
        ? flatten(block.panels.flatMap((panel) => panel.blocks))
        : block.type === 'reveal'
          ? flatten(block.blocks)
          : []),
  ]);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('deck catalog layout renderers', () => {
  it('renders every catalog sample through a lazy family without console errors', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    for (const entry of DECK_LAYOUTS) {
      const Renderer = await loadLayoutRenderer(entry.id);
      expect(Renderer, `renderer for ${entry.id}`).toBeTruthy();
      const { container } = render(Renderer!, {
        props: { layout: entry.id, props: entry.sample },
      });

      await waitFor(() => {
        expect(container.querySelector(`[data-py-deck-layout="${entry.id}"]`)).toBeTruthy();
        expect(container.textContent?.trim().length).toBeGreaterThan(0);
      });
      expect(container.querySelector('[role="note"]'), `${entry.id} composition`).toBeNull();
      if (entry.id === 'chart' || entry.id === 'code-with-callout') {
        expect(container.querySelector(`[${DECK_INTERACTIVE_ATTRIBUTE}]`), entry.id).toBeTruthy();
      }
      cleanup();
    }

    expect(errors).not.toHaveBeenCalled();
  });

  it('marks chart, code and interactive blocks so clicks cannot advance a deck', () => {
    const chart = composeLayout(
      'chart',
      DECK_LAYOUTS.find((entry) => entry.id === 'chart')?.sample
    );
    const code = composeLayout(
      'code-with-callout',
      DECK_LAYOUTS.find((entry) => entry.id === 'code-with-callout')?.sample
    );
    const interactive = composeLayout('free', {
      blocks: [{ type: 'counter', id: 'count', label: 'Count', start: 0 }],
    });

    expect(chart.ok && chart.blocks.some((block) => block.type === 'chart')).toBe(true);
    expect(code.ok && flatten(code.blocks).some((block) => block.type === 'code')).toBe(true);
    expect(interactive.ok && interactive.blocks.some((block) => block.type === 'counter')).toBe(
      true
    );
    if (chart.ok)
      expect(deckInputGuardAttributes(chart.blocks[0]!)).toHaveProperty(DECK_INTERACTIVE_ATTRIBUTE);
    if (code.ok) {
      const codeBlock = flatten(code.blocks).find((block) => block.type === 'code');
      expect(codeBlock && deckInputGuardAttributes(codeBlock)).toHaveProperty(
        DECK_INTERACTIVE_ATTRIBUTE
      );
      expect(deckInputGuardAttributes(code.blocks[1]!)).toHaveProperty(DECK_INTERACTIVE_ATTRIBUTE);
    }
    if (interactive.ok)
      expect(deckInputGuardAttributes(interactive.blocks[0]!)).toHaveProperty(
        DECK_INTERACTIVE_ATTRIBUTE
      );
  });

  it('puts the exported deck marker on a free layout interactive block root', async () => {
    const Renderer = await loadLayoutRenderer('free');
    const { container } = render(Renderer!, {
      props: {
        layout: 'free',
        props: { blocks: [{ type: 'counter', id: 'count', label: 'Count', start: 0 }] },
      },
    });

    await waitFor(() =>
      expect(container.querySelector(`[${DECK_INTERACTIVE_ATTRIBUTE}]`)).toBeTruthy()
    );
  });

  it('rejects invalid layout props before they reach block renderers', async () => {
    expect(composeLayout('title-hero', { title: 'Safe plain text' }).ok).toBe(true);
    expect(composeLayout('title-hero', { title: '' }).ok).toBe(false);
    expect(composeLayout('toString', {}).ok).toBe(false);
    await expect(loadLayoutRenderer('unknown-layout')).resolves.toBeNull();
    await expect(loadLayoutRenderer('toString')).resolves.toBeNull();
  });
});
