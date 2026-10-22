import { describe, expect, it } from 'vitest';
import {
  type DeckLayoutSlideInput,
  propsForSelectedLayout,
  selectDeckLayouts,
} from '../src/authoring/select-deck-layouts.ts';
import { synthesizeDeckOutline } from '../src/brief/deck-outlines.ts';

function slide(
  id: string,
  role: string,
  pacing: string,
  extra: Partial<DeckLayoutSlideInput> = {}
): DeckLayoutSlideInput {
  return { id, role, pacing, ...extra };
}

describe('selectDeckLayouts', () => {
  it('is deterministic for the same slides', () => {
    const slides = [
      slide('a', 'title', 'punch'),
      slide('b', 'problem', 'story'),
      slide('c', 'metrics', 'punch'),
      slide('d', 'close', 'punch'),
    ];
    expect(selectDeckLayouts(slides)).toEqual(selectDeckLayouts(structuredClone(slides)));
  });

  it('maps roles to compatible catalog layouts', () => {
    const result = selectDeckLayouts([
      slide('t', 'title', 'punch'),
      slide('m', 'metrics', 'punch'),
      slide('c', 'comparison', 'diagram'),
      slide('s', 'steps', 'idea'),
      slide('x', 'close', 'punch'),
    ]);
    expect(result.map((row) => row.layout)).toEqual([
      'title-hero',
      'big-stat',
      'comparison-table',
      'process-steps',
      'closing-cta',
    ]);
    expect(result.every((row) => row.rationale.length > 0)).toBe(true);
  });

  it('honours explicit layout overrides', () => {
    const result = selectDeckLayouts([
      slide('a', 'title', 'punch', { layout: 'quote' }),
      slide('b', 'metrics', 'punch'),
    ]);
    expect(result[0]).toMatchObject({
      layout: 'quote',
      override: true,
      rationale: 'Author override: layout "quote".',
    });
    expect(result[1]?.override).toBe(false);
  });

  it('prefers block-type capacity signals over a generic role', () => {
    const result = selectDeckLayouts([
      slide('body', 'concept', 'idea', { blockTypes: ['chart', 'text'] }),
    ]);
    expect(result[0]?.layout).toBe('chart');
    expect(result[0]?.rationale).toMatch(/chart/);
  });

  it('avoids three identical layouts in a row when an alternative fits', () => {
    const slides = [
      slide('1', 'metrics', 'punch'),
      slide('2', 'metrics', 'punch'),
      slide('3', 'metrics', 'punch'),
    ];
    const result = selectDeckLayouts(slides);
    expect(result[0]?.layout).toBe('big-stat');
    expect(result[1]?.layout).toBe('big-stat');
    // Third should not be big-stat if chart is also a metrics candidate.
    expect(result[2]?.layout).not.toBe('big-stat');
    expect(result[2]?.rationale).toMatch(/third identical|avoided/i);
  });

  it('does not break author overrides to avoid repeats', () => {
    const result = selectDeckLayouts([
      slide('1', 'metrics', 'punch', { layout: 'big-stat' }),
      slide('2', 'metrics', 'punch', { layout: 'big-stat' }),
      slide('3', 'metrics', 'punch', { layout: 'big-stat' }),
    ]);
    expect(result.map((row) => row.layout)).toEqual(['big-stat', 'big-stat', 'big-stat']);
    expect(result.every((row) => row.override)).toBe(true);
  });

  it('maps a pitch outline plan without three identical free layouts only', () => {
    const outline = synthesizeDeckOutline('A pitch deck of twelve slides about Example Harbor.');
    const selections = selectDeckLayouts(
      outline.plan.map((row, index) => ({
        id: row.id,
        role: row.role,
        pacing: row.pacing,
        blockTypes: outline.deck.slides[index]?.blocks
          .map((block) =>
            block && typeof block === 'object' && 'type' in block ? String(block.type) : ''
          )
          .filter(Boolean),
      }))
    );
    expect(selections).toHaveLength(outline.plan.length);
    expect(selections[0]?.layout).toBe('title-hero');
    expect(selections[selections.length - 1]?.layout).toBe('closing-cta');
    // No three consecutive identical non-override layouts
    for (let i = 2; i < selections.length; i++) {
      const a = selections[i - 2]?.layout;
      const b = selections[i - 1]?.layout;
      const c = selections[i]?.layout;
      if (a && a === b && b === c && !selections[i]?.override) {
        throw new Error(`three identical layouts at ${i}: ${a}`);
      }
    }
  });
});

describe('propsForSelectedLayout', () => {
  it('seeds catalog sample props with the slide title', () => {
    const props = propsForSelectedLayout('title-hero', { title: 'Harbor launch' });
    expect(props).toMatchObject({ title: 'Harbor launch' });
    const cta = propsForSelectedLayout('closing-cta', { title: 'Thanks' });
    expect(cta).toMatchObject({ title: 'Thanks' });
  });
});
