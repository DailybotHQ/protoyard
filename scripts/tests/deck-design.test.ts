// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Box,
  classifyDeckDesign,
  type DeckDesignMeasure,
  type DeckDesignSlidePlan,
  DISPLAY_TITLE_MIN_RATIO,
  findOverflow,
  findTextOverlaps,
  formatDeckDesignFindings,
  planDeckDesign,
} from '../lib/deck-design.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const FLAGSHIP = JSON.parse(
  readFileSync(join(ROOT, 'blueprints/decks/protoyard-create-anything.json'), 'utf8')
) as unknown;

const STAGE: Box = { x: 49, y: 0, width: 1182, height: 665 };
const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

function measure(overrides: Partial<DeckDesignMeasure> = {}): DeckDesignMeasure {
  return {
    slideId: 'cover',
    stage: STAGE,
    theme: 'aurora-analytics',
    background: 'gradient-dusk',
    displayTitlePx: 88,
    textBoxes: [],
    contentBoxes: [],
    charts: 0,
    series: [],
    ...overrides,
  };
}

function slidePlan(id: string): DeckDesignSlidePlan {
  const slide = planDeckDesign(FLAGSHIP).slides.find((item) => item.id === id);
  if (!slide) throw new Error(`no ${id} slide`);
  return slide;
}

describe('planDeckDesign on the flagship deck', () => {
  const plan = planDeckDesign(FLAGSHIP);

  it('expects the deck theme and every visible slide', () => {
    expect(plan.theme).toBe('aurora-analytics');
    expect(plan.slides).toHaveLength(25);
  });

  it('expects slide backgrounds, falling back to the deck background', () => {
    expect(slidePlan('cover').background).toBe('gradient-dusk');
    expect(slidePlan('quote').background).toBe('pattern-dots');
    expect(slidePlan('problem').background).toBe('solid-surface');
  });

  it('holds cover, divider and big-stat slides to a display title', () => {
    expect(slidePlan('cover').displayTitleMinRatio).toBe(DISPLAY_TITLE_MIN_RATIO['title-hero']);
    expect(slidePlan('how-divider').displayTitleMinRatio).toBe(
      DISPLAY_TITLE_MIN_RATIO['section-divider']
    );
    expect(slidePlan('promise').displayTitleMinRatio).toBe(DISPLAY_TITLE_MIN_RATIO['big-stat']);
    expect(slidePlan('problem').displayTitleMinRatio).toBeNull();
  });

  it('finds charts and interactive blocks, but not inside an embedded app', () => {
    expect(slidePlan('chart').charts).toBe(true);
    expect(slidePlan('explore')).toMatchObject({ charts: true, interactive: ['chart-controls'] });
    expect(slidePlan('poll').interactive).toEqual(['poll']);
    expect(slidePlan('quiz').interactive).toEqual(['quiz']);
    expect(slidePlan('calculator').interactive).toEqual(['calculator']);
    expect(slidePlan('embed')).toMatchObject({ charts: false, interactive: ['embed-app'] });
    expect(slidePlan('cover')).toMatchObject({ charts: false, interactive: [] });
  });

  it('skips hidden slides and reads a bare deck', () => {
    const bare = planDeckDesign({
      style: {},
      slides: [
        { id: 'a', layout: 'quote' },
        { id: 'b', layout: 'quote', hidden: true },
      ],
    });
    expect(bare).toEqual({
      theme: null,
      slides: [
        {
          id: 'a',
          layout: 'quote',
          background: null,
          displayTitleMinRatio: null,
          charts: false,
          interactive: [],
        },
      ],
    });
  });
});

describe('text overlap', () => {
  it('catches the overlapping heading and lead on the fixture quiz slide (regression)', () => {
    // Measured from the T-deck-lint-steps screenshot of the catalog fixture's
    // quiz slide: the lead paragraph and the link were drawn over the heading.
    const overlaps = findTextOverlaps([
      { label: 'Readiness check', box: box(77, 72, 403, 46) },
      { label: 'A short quiz for the dry-run room.', box: box(77, 60, 681, 22) },
      { label: 'Deck guide', box: box(77, 106, 116, 22) },
    ]);
    expect(overlaps.map(({ a, b }) => `${a} | ${b}`)).toEqual([
      'Readiness check | A short quiz for the dry-run room.',
      'Readiness check | Deck guide',
    ]);
    const findings = classifyDeckDesign(
      { ...slidePlan('quiz'), id: 'quiz' },
      measure({
        slideId: 'quiz',
        background: 'solid-surface',
        textBoxes: [
          { label: 'Readiness check', box: box(77, 72, 403, 46) },
          { label: 'A short quiz for the dry-run room.', box: box(77, 60, 681, 22) },
        ],
      }),
      { theme: 'aurora-analytics' }
    );
    expect(findings.map((item) => item.code)).toEqual(['text-overlap']);
  });

  it('accepts stacked lines, touching boxes and lines of one text node', () => {
    expect(
      findTextOverlaps([
        { label: 'Title', box: box(100, 100, 400, 48) },
        // Directly below, sharing a 1px edge.
        { label: 'Subtitle', box: box(100, 147, 400, 24) },
        { label: 'Wrapped', box: box(100, 200, 400, 24) },
        { label: 'Wrapped', box: box(100, 210, 300, 24) },
        // Side by side in one row.
        { label: 'Left', box: box(100, 300, 180, 24) },
        { label: 'Right', box: box(281, 300, 180, 24) },
      ])
    ).toEqual([]);
  });
});

describe('overflow', () => {
  it('flags content outside the stage beyond the tolerance', () => {
    expect(
      findOverflow(STAGE, [
        { label: 'inside', box: box(100, 100, 300, 40) },
        { label: 'ring', box: box(48, 10, 100, 20) },
        { label: 'below', box: box(100, 650, 300, 40) },
        { label: 'empty', box: box(-500, 0, 0, 0) },
      ])
    ).toEqual([{ label: 'below', by: 25 }]);
  });
});

describe('classifyDeckDesign', () => {
  it('passes a slide drawn as designed', () => {
    expect(
      classifyDeckDesign(slidePlan('cover'), measure(), { theme: 'aurora-analytics' })
    ).toEqual([]);
  });

  it('catches the flagship regressions: 24px cover title, default theme, no background', () => {
    const findings = classifyDeckDesign(
      slidePlan('cover'),
      measure({ displayTitlePx: 24, theme: 'violet', background: null }),
      { theme: 'aurora-analytics' }
    );
    expect(findings.map((item) => item.code)).toEqual(['theme', 'background', 'display-title']);
    expect(formatDeckDesignFindings(findings)[2]).toMatch(
      /^cover: display-title: The title-hero title is 24px on a 665px stage \(3\.6%/
    );
  });

  it('catches a blank chart, a missing chart and a missing stage', () => {
    const chart = slidePlan('chart');
    const base = measure({ slideId: 'chart', background: 'solid-surface', displayTitlePx: null });
    expect(
      classifyDeckDesign(
        chart,
        {
          ...base,
          charts: 1,
          series: [
            { chart: 'Adoption', series: 'Decks', area: 0, hasPath: false },
            { chart: 'Adoption', series: 'Apps', area: 12_000, hasPath: true },
          ],
        },
        { theme: 'aurora-analytics' }
      ).map((item) => item.message)
    ).toEqual(['Series "Decks" of chart "Adoption" has no geometry.']);
    expect(
      classifyDeckDesign(chart, base, { theme: 'aurora-analytics' }).map((item) => item.code)
    ).toEqual(['chart-missing']);
    expect(
      classifyDeckDesign(chart, { ...base, charts: 1 }, { theme: 'aurora-analytics' }).map(
        (item) => item.code
      )
    ).toEqual(['chart-empty-series']);
    expect(
      classifyDeckDesign(chart, { ...base, stage: null }, { theme: 'aurora-analytics' })
    ).toEqual([{ code: 'no-stage', slideId: 'chart', message: 'The slide stage did not render.' }]);
  });
});
