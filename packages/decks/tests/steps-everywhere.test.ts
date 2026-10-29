// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECK_LAYOUT_IDS, getDeckLayout, slideStepCount } from '../src/index.ts';
import {
  DECK_LAYOUT_STEPPABLE,
  isSteppablePropPath,
  stepMarkersOutsideLayout,
  steppablePattern,
} from '../src/layouts/index.ts';
import { type DeckSlide, safeParseDeck } from '../src/schema/index.ts';

/**
 * Steps on every catalog prop (PLAN_006 T-steps-everywhere): each layout
 * declares where a step marker reveals something (the props object itself,
 * nested objects, list items), every declared path holds a marker the schema
 * accepts and the steps model counts, and decks without new markers keep their
 * step counts.
 */

const REPO = join(import.meta.dirname, '../../..');

/** `value` with a step marker added at `path` inside it (`*` is the item at `index`). */
function withMarker(value: unknown, pattern: string, index = 1): unknown {
  const copy = structuredClone(value) as Record<string, unknown>;
  const marker = { step: 1, fragment: 'fade-up' as const };
  if (pattern === '') return { ...copy, ...marker };
  let node: unknown = copy;
  const parts = pattern.split('.');
  parts.forEach((part, i) => {
    const container = node as Record<string, unknown> | unknown[];
    const key = part === '*' ? index : part;
    const last = i === parts.length - 1;
    const next = (container as Record<string | number, unknown>)[key];
    if (last)
      (container as Record<string | number, unknown>)[key] = { ...(next as object), ...marker };
    else node = next;
  });
  return copy;
}

/** The sample of a layout with enough list items for index 1 to exist. */
const sample = (layout: string) => structuredClone(getDeckLayout(layout)?.sample ?? {});

describe('DECK_LAYOUT_STEPPABLE', () => {
  it('declares every catalog layout', () => {
    expect(Object.keys(DECK_LAYOUT_STEPPABLE).sort()).toEqual([...DECK_LAYOUT_IDS].sort());
    for (const id of DECK_LAYOUT_IDS) {
      if (id === 'free') expect(DECK_LAYOUT_STEPPABLE[id]).toEqual([]);
      else
        expect(DECK_LAYOUT_STEPPABLE[id as keyof typeof DECK_LAYOUT_STEPPABLE], id).toContain('');
    }
  });

  it.each(DECK_LAYOUT_IDS.filter((id) => id !== 'free'))(
    '%s: a marker on each declared path passes the schema and adds one step',
    (layout) => {
      for (const pattern of DECK_LAYOUT_STEPPABLE[layout as keyof typeof DECK_LAYOUT_STEPPABLE] ??
        []) {
        const props = withMarker(sample(layout), pattern);
        const parsed = safeParseDeck({ style: {}, slides: [{ id: 'one', layout, props }] });
        expect(parsed.success, `${layout} ${pattern || '(props)'}: ${JSON.stringify(parsed)}`).toBe(
          true
        );
        if (!parsed.success) continue;
        const slide = parsed.deck?.slides[0] as DeckSlide;
        const before = slideStepCount({ id: 'one', layout, props: sample(layout) } as DeckSlide);
        expect(slideStepCount(slide), `${layout} ${pattern}`).toBe(Math.max(before, 1));
        expect(stepMarkersOutsideLayout(slide), `${layout} ${pattern}`).toEqual([]);
      }
    }
  );
});

describe('isSteppablePropPath', () => {
  it('matches list items by pattern and refuses undeclared paths', () => {
    expect(steppablePattern(['cards', 2])).toBe('cards.*');
    expect(isSteppablePropPath('three-column-cards', ['cards', 2])).toBe(true);
    expect(isSteppablePropPath('big-stat', [])).toBe(true);
    expect(isSteppablePropPath('closing-cta', ['cta'])).toBe(true);
    expect(isSteppablePropPath('chart', ['spec', 'series', 0])).toBe(false);
    expect(isSteppablePropPath('free', [])).toBe(false);
    expect(isSteppablePropPath('no-such-layout', [])).toBe(false);
  });

  it('lists markers a layout does not reveal (inside a chart series)', () => {
    const props = sample('chart') as { spec: { series: Record<string, unknown>[] } };
    props.spec.series[0] = { ...props.spec.series[0], step: 1 };
    const slide = { id: 'c', layout: 'chart', props } as DeckSlide;
    expect(stepMarkersOutsideLayout(slide)).toEqual([['spec', 'series', 0]]);
    expect(stepMarkersOutsideLayout({ id: 'f', layout: 'free', blocks: [] } as DeckSlide)).toEqual(
      []
    );
  });
});

describe('existing decks keep their step counts', () => {
  it('every catalog deck has no marker outside its layouts, and counts are unchanged', () => {
    const counts: Record<string, number[]> = {};
    for (const file of readdirSync(join(REPO, 'blueprints/decks')).filter((n) =>
      n.endsWith('.json')
    )) {
      const deck = JSON.parse(readFileSync(join(REPO, 'blueprints/decks', file), 'utf8')).deck;
      const parsed = safeParseDeck(deck);
      expect(parsed.success, file).toBe(true);
      const slides = (parsed.deck?.slides ?? []) as DeckSlide[];
      for (const slide of slides)
        expect(stepMarkersOutsideLayout(slide), `${file} ${slide.id}`).toEqual([]);
      counts[file] = slides.map(slideStepCount);
    }
    // The step model is unchanged: these counts were measured before steps everywhere.
    expect(
      Object.values(counts)
        .flat()
        .reduce((a, b) => a + b, 0)
    ).toBeGreaterThan(0);
    expect(counts['protoyard-create-anything.json']).toMatchInlineSnapshot(`
      [
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]
    `);
  });
});
