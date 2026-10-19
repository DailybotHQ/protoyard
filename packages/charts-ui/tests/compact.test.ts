import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Gauge from '../src/compact/Gauge.svelte';
import RadialProgress from '../src/compact/RadialProgress.svelte';
import Sparkline from '../src/compact/Sparkline.svelte';
import { trendLabel, trendSummary } from '../src/compact/trend.ts';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.pyMotion;
});

const marker = (name: string) => document.querySelector(`[data-marker="${name}"]`);

describe('trend text', () => {
  it('summarises direction and change', () => {
    expect(trendLabel([100, 90, 112], '30 days')).toBe('Trend: up 12% over 30 days');
    expect(trendLabel([200, 150], 'a week')).toBe('Trend: down 25% over a week');
    expect(trendLabel([5, 9, 5])).toBe('Trend: flat');
    expect(trendLabel([0, 4], '7 days', (v) => `${v} orders`)).toBe(
      'Trend: up from 0 orders to 4 orders over 7 days'
    );
    expect(trendLabel([null, 3])).toBe('No trend data');
    expect(trendSummary([null, 10, null, 15])).toMatchObject({
      direction: 'up',
      change: 0.5,
      first: 10,
      last: 15,
    });
  });
});

describe('Sparkline', () => {
  it('is an image with a trend sentence and marks the last value', () => {
    render(Sparkline, { values: [100, 90, 95, 112], period: '30 days' });
    const img = screen.getByRole('img', { name: 'Trend: up 12% over 30 days' });
    expect(img.tagName.toLowerCase()).toBe('svg');
    const last = marker('last');
    expect(last).toBeTruthy();
    // The last point sits at the right edge of the 100-unit viewBox.
    expect(last?.getAttribute('x1')).toBe('100');
    expect(img.querySelector('path')?.getAttribute('d')).toMatch(/^M0,/);
  });

  it('honours a custom label, min/max markers and skips a trailing gap for the last marker', () => {
    render(Sparkline, {
      values: [4, 1, 9, null],
      label: 'Signups this week',
      showMinMax: true,
      height: 40,
    });
    expect(screen.getByRole('img', { name: 'Signups this week' })).toBeTruthy();
    expect(marker('min')?.getAttribute('x1')).toBe(String((1 * 100) / 3));
    expect(Number(marker('max')?.getAttribute('y1'))).toBe(3);
    expect(Number(marker('last')?.getAttribute('x1'))).toBeCloseTo(200 / 3, 5);
  });

  it('draws bars from a zero baseline and areas under the line', () => {
    render(Sparkline, { values: [2, -1, 3], variant: 'bar', label: 'Net' });
    const bars = document.querySelectorAll('rect');
    expect(bars).toHaveLength(3);
    // The negative bar hangs below the baseline that the positive bars stand on.
    const [a, b] = [...bars].map((r) => ({
      y: Number(r.getAttribute('y')),
      h: Number(r.getAttribute('height')),
    }));
    expect((b as { y: number }).y).toBeCloseTo(
      (a as { y: number; h: number }).y + (a as { h: number }).h,
      5
    );
    cleanup();
    render(Sparkline, { values: [1, 2, 3], variant: 'area', label: 'Area' });
    expect(document.querySelectorAll('path')).toHaveLength(2);
  });

  it('animates in only when motion is allowed', () => {
    render(Sparkline, { values: [1, 2], label: 'Animated' });
    const animated = screen.getByRole('img', { name: 'Animated' });
    expect(animated.getAttribute('data-motion')).toBe('full');
    expect(animated.getAttribute('class')).toContain('py-spark-in');
    cleanup();
    document.documentElement.dataset.pyMotion = 'reduce';
    render(Sparkline, { values: [1, 2], label: 'Still' });
    const still = screen.getByRole('img', { name: 'Still' });
    expect(still.getAttribute('data-motion')).toBe('reduce');
    expect(still.getAttribute('class')).not.toContain('py-spark-in');
  });

  it('handles flat, single and empty series without NaN', () => {
    render(Sparkline, { values: [5, 5, 5], label: 'Flat' });
    expect(document.querySelector('path')?.getAttribute('d')).not.toContain('NaN');
    cleanup();
    render(Sparkline, { values: [], label: 'Empty' });
    expect(screen.getByRole('img', { name: 'Empty' })).toBeTruthy();
    expect(marker('last')).toBeNull();
  });
});

describe('Gauge', () => {
  it('is a meter with its range, value and threshold band', () => {
    render(Gauge, {
      label: 'CPU usage',
      value: 72,
      thresholds: [60, 85],
      bandLabels: ['Healthy', 'Busy', 'Critical'],
      format: (v: number) => `${v}%`,
    });
    const meter = screen.getByRole('meter', { name: 'CPU usage' });
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuenow')).toBe('72');
    expect(meter.getAttribute('aria-valuetext')).toBe('72%, Busy');
    expect(document.querySelectorAll('[data-band]')).toHaveLength(3);
    expect(document.querySelector('[data-value-arc]')?.getAttribute('fill')).toBe(
      'var(--py-warning)'
    );
  });

  it('clamps out-of-range values', () => {
    render(Gauge, { label: 'Load', value: 140, max: 120 });
    const meter = screen.getByRole('meter', { name: 'Load' });
    expect(meter.getAttribute('aria-valuenow')).toBe('120');
    expect(meter.getAttribute('aria-valuetext')).toBe('120');
    expect(document.querySelectorAll('[data-band]')).toHaveLength(0);
  });
});

describe('RadialProgress', () => {
  it('reports progress as a percentage', () => {
    render(RadialProgress, { label: 'Onboarding', value: 3, max: 4 });
    const bar = screen.getByRole('progressbar', { name: 'Onboarding' });
    expect(bar.getAttribute('aria-valuenow')).toBe('75');
    expect(bar.getAttribute('aria-valuetext')).toBe('75%');
    expect(document.querySelector('[data-progress-arc]')).toBeTruthy();
  });

  it('shows an empty ring at 0 and a full ring at 100%', () => {
    render(RadialProgress, { label: 'Empty', value: 0 });
    expect(document.querySelector('[data-progress-arc]')).toBeNull();
    cleanup();
    render(RadialProgress, { label: 'Done', value: 2, max: 1 });
    expect(screen.getByRole('progressbar', { name: 'Done' }).getAttribute('aria-valuenow')).toBe(
      '100'
    );
    expect(document.querySelector('[data-progress-arc]')?.getAttribute('d')).toContain('A');
  });
});
