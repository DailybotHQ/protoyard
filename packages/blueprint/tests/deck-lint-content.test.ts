import { describe, expect, it } from 'vitest';
import { lintDeckContent } from '../src/authoring/deck-lint.ts';

const deck = (slides: unknown[]) => ({ style: {}, slides });
const chartSpec = (description?: string) => ({
  kind: 'bar',
  title: 'Weekly signups',
  ...(description === undefined ? {} : { description }),
  labels: ['Mon', 'Tue'],
  series: [{ label: 'Signups', values: [12, 18] }],
});

describe('lintDeckContent', () => {
  it('reports an image without alternative text as a hard error', () => {
    const result = lintDeckContent(
      deck([
        {
          id: 'image',
          layout: 'free',
          blocks: [{ type: 'image', src: '/assets/chart.webp', width: 640, height: 360 }],
        },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'image-alt',
        severity: 'error',
        jsonPath: '$["slides"][0]["blocks"][0]["alt"]',
      })
    );
  });

  it('requires chart descriptions and warns when a description is too short to explain the chart', () => {
    const result = lintDeckContent(
      deck([
        { id: 'missing', layout: 'chart', props: { spec: chartSpec() } },
        { id: 'short', layout: 'chart', props: { spec: chartSpec('Signups rise.') } },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'chart-description',
        severity: 'error',
        jsonPath: '$["slides"][0]["props"]["spec"]["description"]',
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'chart-description-short',
        severity: 'warning',
        jsonPath: '$["slides"][1]["props"]["spec"]["description"]',
      })
    );
  });

  it('requires CTA labels on free blocks', () => {
    const result = lintDeckContent(
      deck([
        {
          id: 'cta',
          layout: 'free',
          blocks: [{ type: 'cta', actions: [{ href: '/next' }] }],
        },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'cta-label',
        severity: 'error',
        jsonPath: '$["slides"][0]["blocks"][0]["actions"][0]["label"]',
      })
    );
  });

  it('keeps density estimates and optional notes guidance as warnings', () => {
    const longCopy = Array.from({ length: 70 }, (_, index) => `word${index}`).join(' ');
    const result = lintDeckContent(
      deck([
        {
          id: 'dense',
          layout: 'free',
          blocks: [{ type: 'text', markdown: longCopy }],
        },
      ])
    );

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'too-many-words', severity: 'warning' })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'notes-missing', severity: 'warning' })
    );
  });

  it('checks charts inside free block containers', () => {
    const result = lintDeckContent(
      deck([
        {
          id: 'chart',
          layout: 'free',
          blocks: [{ type: 'chart', spec: chartSpec() }],
        },
      ])
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'chart-description',
        jsonPath: '$["slides"][0]["blocks"][0]["spec"]["description"]',
      })
    );
  });
});
