import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAppearance, BUILTIN_THEMES, clearAppearance } from '../../themes/src/index.ts';
import { LineChart, texuliXProps } from '../src/cartesian/index.ts';

afterEach(() => {
  cleanup();
  clearAppearance(document.documentElement);
});

const series = [
  {
    id: 'signups',
    label: 'Signups',
    points: [
      { x: 'Mon', y: 10 },
      { x: 'Tue', y: 14 },
      { x: 'Wed', y: 12 },
    ],
  },
];

describe('charts-ui on Texuli 0.8', () => {
  it('needs no local color map: the theme writes the --tx-chart-N names Texuli charts read', () => {
    const theme = BUILTIN_THEMES.find((t) => t.id === 'ocean') ?? BUILTIN_THEMES[0];
    if (!theme) throw new Error('no built-in theme');
    applyAppearance(document.documentElement, { theme, resolvedMode: 'dark' });
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--tx-chart-1')).toBe(theme.dark.chart1);
    expect(root.getPropertyValue('--tx-chart-5')).toBe(theme.dark.chart5);
    expect(root.getPropertyValue('--tx-chart1')).toBe('');
    const { container } = render(LineChart, { title: 'Signups', series });
    const chart = container.querySelector<HTMLElement>('[data-py-chart]');
    expect(chart).not.toBeNull();
    // Nothing between the theme and Texuli's chart redefines the series colors.
    expect(chart?.getAttribute('style') ?? '').not.toContain('--tx-chart');
  });
});

describe('time and linear x axes reach Texuli (G97)', () => {
  const epoch = [{ id: 's', label: 'S', points: [{ x: Date.UTC(2026, 2, 2), y: 1 }] }];

  it('forwards xKind, formatX and locale for numeric x', () => {
    const formatX = (value: number | string) => String(value);
    expect(texuliXProps(epoch, { xKind: 'time', formatX, locale: 'en-GB' })).toEqual({
      xKind: 'time',
      formatX,
      locale: 'en-GB',
    });
    expect(texuliXProps(epoch, {})).toEqual({});
  });

  it('keeps the inferred axis when a time or linear kind meets string x (Texuli would throw)', () => {
    expect(texuliXProps(series, { xKind: 'time' })).toEqual({});
    expect(texuliXProps(series, { xKind: 'linear' })).toEqual({});
    expect(texuliXProps(series, { xKind: 'category' })).toEqual({ xKind: 'category' });
  });

  it('a LineChart with xKind="time" renders on Texuli whether x is epoch ms or text', () => {
    expect(() => render(LineChart, { title: 'Epoch', series: epoch, xKind: 'time' })).not.toThrow();
    expect(() => render(LineChart, { title: 'Days', series, xKind: 'time' })).not.toThrow();
    expect(document.querySelectorAll('[data-py-chart]').length).toBeGreaterThanOrEqual(2);
  });
});
