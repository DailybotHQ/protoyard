import { describe, expect, it } from 'vitest';
import { lintDeckStructure } from '../src/authoring/deck-lint.ts';

function deck(slides: unknown[], outline?: unknown) {
  return {
    style: {},
    slides,
    ...(outline === undefined ? {} : { outline }),
  };
}

function titleSlide(id: string, extra: Record<string, unknown> = {}) {
  return { id, layout: 'title-hero', props: { title: id }, ...extra };
}

const textBlock = (step: number, markdown = `Step ${step}`) => ({
  type: 'text',
  step,
  markdown,
});

describe('lintDeckStructure', () => {
  it('accepts a valid deck, ordered outline and internal slide deep link', () => {
    const result = lintDeckStructure(
      deck(
        [
          {
            id: 'intro',
            layout: 'closing-cta',
            props: { title: 'Start', cta: { label: 'Continue', href: '#/closing/1' } },
          },
          { ...titleSlide('closing'), steps: ['Reveal'] },
        ],
        { sections: [{ id: 'main', slideIds: ['intro', 'closing'] }] }
      )
    );

    expect(result).toEqual({ valid: true, diagnostics: [] });
  });

  it('reports missing and duplicate ids with stable codes and JSON paths', () => {
    const missing = lintDeckStructure(
      deck([{ layout: 'title-hero', props: { title: 'Missing' } }])
    );
    expect(missing.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'missing-slide-id', jsonPath: '$["slides"][0]["id"]' })
    );

    const duplicate = lintDeckStructure(deck([titleSlide('intro'), titleSlide('intro')]));
    expect(duplicate.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'duplicate-slide-id', jsonPath: '$["slides"][1]["id"]' })
    );
  });

  it('reports unknown layouts and props that do not match a known layout', () => {
    const result = lintDeckStructure(
      deck([
        { id: 'unknown', layout: 'mystery', props: {} },
        { id: 'inherited', layout: 'constructor', props: {} },
        { id: 'bad-props', layout: 'title-hero', props: { title: 'Valid title', extra: true } },
      ])
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unknown-layout', jsonPath: '$["slides"][0]["layout"]' })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unknown-layout', jsonPath: '$["slides"][1]["layout"]' })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'invalid-layout-props',
        jsonPath: '$["slides"][2]["props"]',
      })
    );
  });

  it('reports an outline that reverses deck slide order', () => {
    const result = lintDeckStructure(
      deck([titleSlide('intro'), titleSlide('middle'), titleSlide('closing')], {
        sections: [{ id: 'all', slideIds: ['intro', 'closing', 'middle'] }],
      })
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'invalid-slide-order',
        jsonPath: '$["outline"]["sections"][0]["slideIds"][2]',
      })
    );
  });

  it('reports fragments that move backward in visual order and out-of-range steps', () => {
    const reversed = lintDeckStructure(
      deck([{ id: 'steps', layout: 'free', blocks: [textBlock(2), textBlock(1)] }])
    );
    expect(reversed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'invalid-fragment-order',
        jsonPath: '$["slides"][0]["blocks"][1]["step"]',
      })
    );

    const outOfRange = lintDeckStructure(
      deck([{ id: 'steps', layout: 'free', blocks: [textBlock(33)] }])
    );
    expect(outOfRange.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'invalid-fragment-order',
        jsonPath: '$["slides"][0]["blocks"][0]["step"]',
      })
    );
  });

  it('reports broken, malformed and hidden-slide deep links', () => {
    const result = lintDeckStructure(
      deck([
        {
          id: 'start',
          layout: 'closing-cta',
          props: { title: 'Start', cta: { label: 'Go', href: '#/missing/0' } },
        },
        {
          id: 'hidden',
          hidden: true,
          layout: 'closing-cta',
          props: { title: 'Hidden', cta: { label: 'Go', href: '#/hidden/0' } },
        },
        {
          id: 'malformed',
          layout: 'closing-cta',
          props: { title: 'Malformed', cta: { label: 'Go', href: '#/start/33' } },
        },
      ])
    );

    expect(result.diagnostics).toHaveLength(3);
    expect(result.diagnostics.every((item) => item.code === 'broken-slide-link')).toBe(true);
    expect(result.diagnostics.map((item) => item.jsonPath)).toEqual([
      '$["slides"][0]["props"]["cta"]["href"]',
      '$["slides"][1]["props"]["cta"]["href"]',
      '$["slides"][2]["props"]["cta"]["href"]',
    ]);
  });

  it('does not mutate the input deck', () => {
    const input = deck([titleSlide('intro')]);
    const before = structuredClone(input);
    lintDeckStructure(input);
    expect(input).toEqual(before);
  });
});
