import { describe, expect, it } from 'vitest';
import { lintDeckContent } from '../src/authoring/deck-lint.ts';

const deck = (slides: unknown[]) => ({ style: {}, slides });
const titleSlide = (id: string) => ({ id, layout: 'title-hero', props: { title: id } });

describe('deck layout lint', () => {
  it('warns on three repeated visible layouts when alternatives are available', () => {
    const result = lintDeckContent(
      deck([titleSlide('one'), titleSlide('two'), titleSlide('three')])
    );

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'layout-repetition',
        severity: 'warning',
        jsonPath: '$["slides"][2]["layout"]',
      })
    );
  });

  it('does not warn for two repeated layouts or carry a run across another layout', () => {
    const two = lintDeckContent(deck([titleSlide('one'), titleSlide('two')]));
    const interrupted = lintDeckContent(
      deck([
        titleSlide('one'),
        titleSlide('two'),
        { id: 'break', layout: 'section-divider', props: { title: 'Chapter' } },
        titleSlide('three'),
      ])
    );

    expect(two.diagnostics.some((item) => item.code === 'layout-repetition')).toBe(false);
    expect(interrupted.diagnostics.some((item) => item.code === 'layout-repetition')).toBe(false);
  });

  it('reports free-layout block capacity violations as hard errors', () => {
    const blocks = Array.from({ length: 49 }, (_, index) => ({
      type: 'text',
      markdown: `Block ${index}`,
    }));
    const result = lintDeckContent(deck([{ id: 'over-capacity', layout: 'free', blocks }]));

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'layout-capacity',
        severity: 'error',
        jsonPath: '$["slides"][0]["props"]["blocks"]',
      })
    );
  });

  it('reports catalog-declared collection overages as hard capacity errors', () => {
    const result = lintDeckContent(
      deck([
        {
          id: 'too-many-cards',
          layout: 'three-column-cards',
          props: {
            cards: [
              { title: 'A', body: 'One' },
              { title: 'B', body: 'Two' },
              { title: 'C', body: 'Three' },
              { title: 'D', body: 'Four' },
            ],
          },
        },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'layout-capacity',
        severity: 'error',
        jsonPath: '$["slides"][0]["props"]["cards"]',
      })
    );
  });
});
