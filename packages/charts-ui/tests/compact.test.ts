import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { Gauge, RadialProgress, Sparkline, trendSummary } from '../src/compact/index.ts';

afterEach(() => cleanup());

describe('compact adapters over @texuli/charts', () => {
  it('Sparkline, Gauge and RadialProgress mount', () => {
    render(Sparkline, { values: [1, 2, 3, 2, 4], label: 'Trend' });
    expect(document.querySelector('svg, canvas, [role="img"]')).toBeTruthy();
    cleanup();
    render(Gauge, { label: 'Health', value: 72, max: 100 });
    expect(document.body.textContent).toMatch(/Health|72/);
    cleanup();
    render(RadialProgress, { label: 'Done', value: 0.4, max: 1 });
    expect(document.body.textContent).toMatch(/Done|40/);
  });

  it('Gauge forwards a plain-data format spec to Texuli', () => {
    render(Gauge, {
      label: 'Conversion',
      value: 0.42,
      max: 1,
      format: { type: 'number', style: 'percent', locale: 'en-US' },
    });
    expect(document.body.textContent).toContain('42%');
  });

  it('Sparkline keeps its trend sentence and accepts a plain-data spec for Texuli', () => {
    render(Sparkline, {
      values: [1000, 2000],
      formatSpec: { type: 'number', notation: 'compact', locale: 'en-US' },
    });
    expect(document.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Trend: up 100%');
  });

  it('trendSummary classifies direction', () => {
    expect(trendSummary([1, 2, 3]).direction).toBe('up');
    expect(trendSummary([3, 2, 1]).direction).toBe('down');
  });
});
