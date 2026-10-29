import type { Deck, FreeSlide } from '@protoyard/decks/schema';
import type { DeckSlide } from '@texuli/deck/model';
import { deckValidationHooks, prepareDeck } from '@texuli/slides/stage';
import { describe, expect, it } from 'vitest';
import { createProtoyardRenderers, validateProtoyardBlock } from '../src/app/renderers.ts';
import { stageDeck } from '../src/app/stage-deck.ts';

/**
 * Protoyard's renderer table for the `@texuli/slides` stage (DeckApp mounts it
 * with `defaultRenderers={false}`): it answers every slide kind a Protoyard
 * deck has, and its `validateBlock` replaces the stage's `@texuli/blocks`
 * check, so Protoyard-only blocks reach Protoyard's free-slide renderer.
 */
const poll = {
  type: 'poll',
  id: 'p1',
  question: 'Which one?',
  options: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
};

function deck(): Deck {
  return {
    style: { aspect: '16:9' },
    slides: [
      { id: 'cover', layout: 'title-hero', props: { title: 'Hello' } },
      {
        id: 'vote',
        layout: 'free',
        steps: ['Ask', 'Vote'],
        blocks: [
          { type: 'heading', text: 'Vote now', level: 2 },
          { type: 'text', markdown: 'First', step: 1 },
          { ...poll, step: 2 },
        ],
      },
      { id: 'own', layout: 'custom', props: { component: 'pricing' } },
    ],
  } as unknown as Deck;
}

function slideOf(layout: string, id = 's'): DeckSlide {
  return { id, layout, props: {} } as unknown as DeckSlide;
}

describe('createProtoyardRenderers', () => {
  const table = createProtoyardRenderers(new Map());
  const lookup = { tier: 'developer' } as const;

  it('answers catalog layouts, free slides and custom slides (no stage defaults needed)', () => {
    expect(table.layout?.(slideOf('title-hero') as never, lookup)).toBeTruthy();
    expect(table.layout?.(slideOf('chart') as never, lookup)).toBeTruthy();
    expect(table.free?.(slideOf('free') as never, lookup)).toBeTruthy();
    expect(table.custom?.(slideOf('custom') as never, lookup)).toBeTruthy();
    expect(table.layout?.(slideOf('not-a-layout') as never, lookup)).toBeFalsy();
  });

  it('prefetches layout, free and custom renderers', async () => {
    await expect(table.prefetch?.(slideOf('big-stat'))).resolves.toBeTruthy();
    await expect(table.prefetch?.(slideOf('custom'))).resolves.toBeTruthy();
    await expect(table.prefetch?.(slideOf('free'))).resolves.toBeTruthy();
  }, 60_000);
});

describe('validateProtoyardBlock', () => {
  it('accepts a Protoyard-only block', () => {
    expect(validateProtoyardBlock(poll, ['slides', 1, 'blocks', 0])).toEqual([]);
  });

  it('refuses an untyped value with a path into the deck', () => {
    for (const bad of [null, 'text', [], { id: 'x' }, { type: '' }]) {
      const issues = validateProtoyardBlock(bad, ['slides', 1, 'blocks', 0]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        code: 'block-props',
        severity: 'error',
        jsonPath: '$.slides[1].blocks[0]',
      });
    }
  });
});

describe('the stage prepares a Protoyard deck with this table', () => {
  it('keeps free slides free, validates their Protoyard blocks and counts their steps', () => {
    const stage = stageDeck(deck());
    const hooks = deckValidationHooks([createProtoyardRenderers(stage.freeSlides)]);
    const prepared = prepareDeck(stage.input, hooks);
    expect(prepared.ok, JSON.stringify(prepared.issues)).toBe(true);
    if (!prepared.ok) return;
    const vote = prepared.deck.slides[1];
    expect(vote?.layout).toBe('free');
    // The first heading names an untitled free slide.
    expect(vote?.title).toBe('Vote now');
    expect(stage.freeSlides.get('vote')?.blocks).toHaveLength(3);
  });

  it('the table block check replaces the stage default (@texuli/blocks)', () => {
    const hooks = deckValidationHooks([createProtoyardRenderers(new Map())]);
    const block = { id: 'untyped' };
    expect(hooks.validateBlock?.(block as never, ['blocks', 0])).toEqual(
      validateProtoyardBlock(block, ['blocks', 0])
    );
  });

  it('an untyped block is refused before the stage paints it', () => {
    const bad = deck();
    (bad.slides[1] as FreeSlide).blocks[2] = { id: 'p1' } as never;
    const stage = stageDeck(bad);
    const prepared = prepareDeck(
      stage.input,
      deckValidationHooks([createProtoyardRenderers(stage.freeSlides)])
    );
    // The deck model refuses it (an untyped item never reaches the block hook).
    expect(prepared.ok).toBe(false);
    expect(
      prepared.issues.some((issue) => issue.path.join('.').startsWith('slides.1.blocks.2'))
    ).toBe(true);
  });
});
