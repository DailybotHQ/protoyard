import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAppearance, BUILTIN_THEMES, clearAppearance } from '../../themes/src/index.ts';
import { LineChart, seriesFromRows, valueFormatter } from '../src/cartesian/index.ts';
import { CHART_FAMILIES } from '../src/index.ts';
import { PieChart } from '../src/part-whole/index.ts';

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

describe('charts-ui root', () => {
  it('lists every family including flow and interaction', () => {
    expect(CHART_FAMILIES).toEqual(
      expect.arrayContaining([
        'cartesian',
        'part-whole',
        'matrix',
        'compact',
        'canvas',
        'geo',
        'flow',
        'interaction',
      ])
    );
  });
});

describe('chart data contracts', () => {
  it('seriesFromRows builds series from rows and valueFormatter formats integer cents', () => {
    const built = seriesFromRows([{ d: 'a', v: 2 }], {
      x: (r) => r.d,
      series: [{ id: 'v', label: 'V', y: (r) => r.v }],
    });
    expect(built[0]?.points[0]).toMatchObject({ x: 'a', y: 2 });
    expect(valueFormatter({ unit: 'cents' })(123_45)).toBe('$123.45');
  });

  it('LineChart renders a named Texuli figure, and an empty state without points', () => {
    render(LineChart, { title: 'Signups', series, description: 'Daily signups' });
    expect(screen.getByRole('figure', { name: /Signups/ })).toBeTruthy();
    cleanup();
    render(LineChart, {
      title: 'Empty',
      series: [{ id: 'a', label: 'A', points: [] }],
      emptyMessage: 'Nothing yet',
    });
    expect(screen.getByRole('status').textContent).toContain('Nothing yet');
  });

  it('PieChart renders an accessible graphic', () => {
    render(PieChart, {
      title: 'Platforms',
      description: 'By platform',
      data: [
        { id: 'a', label: 'Web', value: 40 },
        { id: 'b', label: 'iOS', value: 30 },
      ],
    });
    expect(screen.getByRole('img', { name: /Platforms|By platform/ })).toBeTruthy();
  });
});

describe('chart palette', () => {
  it('needs no local color map: the theme writes the --tx-chart-N names Texuli charts read', () => {
    const theme = BUILTIN_THEMES.find((t) => t.id === 'ocean') ?? BUILTIN_THEMES[0];
    if (!theme) throw new Error('no built-in theme');
    applyAppearance(document.documentElement, { theme, resolvedMode: 'dark' });
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--tx-chart-1')).toBe(theme.dark.chart1);
    expect(root.getPropertyValue('--tx-chart-5')).toBe(theme.dark.chart5);
    const { container } = render(LineChart, { title: 'Signups', series });
    const chart = container.querySelector<HTMLElement>('[data-py-chart]');
    expect(chart).not.toBeNull();
    // Nothing between the theme and Texuli's chart redefines the series colors.
    expect(chart?.getAttribute('style') ?? '').not.toContain('--tx-chart');
  });
});
