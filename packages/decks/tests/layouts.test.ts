// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DECK_LAYOUT_IDS,
  DECK_LAYOUTS,
  describeLayouts,
  getDeckLayout,
  LAYOUT_PACING,
  parseLayoutProps,
} from '../src/layouts/index.ts';

const SITE_LAYOUTS = [
  'title-hero',
  'section-divider',
  'two-column-split',
  'three-column-cards',
  'image-left',
  'image-right',
  'image-centered',
  'image-full-bleed',
  'quote',
  'code-with-callout',
  'big-stat',
  'comparison-table',
  'process-steps',
  'timeline',
  'team-avatars',
  'closing-cta',
  'video-centered',
  'video-left',
  'video-right',
] as const;

describe('DECK_LAYOUTS catalog', () => {
  it('lists 21 layouts: the 19 site primitives plus chart and free', () => {
    expect(DECK_LAYOUTS).toHaveLength(21);
    expect(DECK_LAYOUT_IDS).toEqual(DECK_LAYOUTS.map((l) => l.id));
    for (const id of SITE_LAYOUTS) {
      expect(DECK_LAYOUT_IDS, id).toContain(id);
    }
    expect(DECK_LAYOUT_IDS).toContain('chart');
    expect(DECK_LAYOUT_IDS).toContain('free');
  });

  it('gives every entry non-empty useWhen, dontUseWhen, pacing and limits', () => {
    for (const layout of DECK_LAYOUTS) {
      expect(layout.useWhen.length, layout.id).toBeGreaterThan(0);
      expect(layout.dontUseWhen.length, layout.id).toBeGreaterThan(0);
      expect(layout.pacing.length, layout.id).toBeGreaterThan(0);
      for (const pace of layout.pacing) {
        expect(LAYOUT_PACING).toContain(pace);
      }
      expect(layout.limits.summary.length, layout.id).toBeGreaterThan(0);
      expect(layout.label.length).toBeGreaterThan(0);
      expect(getDeckLayout(layout.id)).toBe(layout);
    }
  });

  it.each(DECK_LAYOUTS.map((l) => [l.id, l] as const))(
    'validates the sample props for %s',
    (id, layout) => {
      const result = parseLayoutProps(id, layout.sample);
      expect(result.issues, JSON.stringify(result.issues)).toEqual([]);
      expect(result.success).toBe(true);
    }
  );

  it('rejects over-limit props on bounded layouts', () => {
    const cards = parseLayoutProps('three-column-cards', {
      cards: [
        { heading: 'A', body: 'a' },
        { heading: 'B', body: 'b' },
      ],
    });
    expect(cards.success).toBe(false);

    const steps = parseLayoutProps('process-steps', {
      steps: [
        { title: '1' },
        { title: '2' },
        { title: '3' },
        { title: '4' },
        { title: '5' },
        { title: '6' },
      ],
    });
    expect(steps.success).toBe(false);

    const events = parseLayoutProps('timeline', {
      events: [
        { time: '1', text: 'a' },
        { time: '2', text: 'b' },
        { time: '3', text: 'c' },
      ],
    });
    expect(events.success).toBe(false);

    const people = parseLayoutProps('team-avatars', {
      people: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}` })),
    });
    expect(people.success).toBe(false);

    const comparison = parseLayoutProps('comparison-table', {
      columns: ['A', 'B'],
      rows: [
        { label: 'r1', values: ['x', 'y'] },
        { label: 'r2', values: ['x'] },
        { label: 'r3', values: ['x', 'y'] },
      ],
    });
    expect(comparison.success).toBe(false);

    const columns = parseLayoutProps('comparison-table', {
      columns: ['A'],
      rows: [
        { label: 'r1', values: ['x'] },
        { label: 'r2', values: ['y'] },
        { label: 'r3', values: ['z'] },
      ],
    });
    expect(columns.success).toBe(false);
  });

  it('rejects unknown layout ids', () => {
    const result = parseLayoutProps('not-a-layout', {});
    expect(result.success).toBe(false);
    expect(result.issues[0]?.message).toMatch(/Unknown layout/);
  });

  it('describeLayouts lists every id for agents', () => {
    const text = describeLayouts();
    expect(text).toContain('Deck layout catalog');
    for (const id of DECK_LAYOUT_IDS) {
      expect(text).toContain(id);
    }
    expect(text).toContain('Use when:');
    expect(text).toContain("Don't use when:");
  });
});
