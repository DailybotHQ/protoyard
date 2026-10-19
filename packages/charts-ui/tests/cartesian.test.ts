import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AreaChart from '../src/cartesian/AreaChart.svelte';
import BarChart from '../src/cartesian/BarChart.svelte';
import ComboChart from '../src/cartesian/ComboChart.svelte';
import LineChart from '../src/cartesian/LineChart.svelte';
import {
  type CartesianSeries,
  comboRoles,
  seriesFromRows,
  tickFormatter,
  valueFormatter,
} from '../src/cartesian/model.ts';
import ScatterChart from '../src/cartesian/ScatterChart.svelte';

class FixedWidthObserver {
  static width = 600;
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: FixedWidthObserver.width, height: 260 },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal('ResizeObserver', FixedWidthObserver));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DAY = 86_400_000;
const T0 = Date.parse('2026-03-01T00:00:00Z');
const daily = (
  id: string,
  label: string,
  values: (number | null)[],
  extra: Partial<CartesianSeries> = {}
): CartesianSeries => ({
  id,
  label,
  points: values.map((y, i) => ({ x: T0 + i * DAY, y })),
  ...extra,
});
const cats = (
  id: string,
  label: string,
  values: Record<string, number | null>,
  extra: Partial<CartesianSeries> = {}
): CartesianSeries => ({
  id,
  label,
  points: Object.entries(values).map(([x, y]) => ({ x, y })),
  ...extra,
});
const lines = () => document.querySelectorAll('[data-line]');
const bars = (series?: string) =>
  [...document.querySelectorAll<SVGRectElement>('[data-bar]')].filter(
    (r) => !series || r.dataset.series === series
  );
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));
const live = () => document.querySelector('[data-chart-live]')?.textContent ?? '';
const chart = (title: string) => screen.getByRole('group', { name: new RegExp(`^${title}`) });
// Default frame margin top 8 + bottom 28 at height 260.
const PLOT_HEIGHT = 260 - 8 - 28;

describe('cartesian model', () => {
  it('builds series from rows and formats units', () => {
    const rows = [
      { day: 'Mon', signups: 4, trials: 1 },
      { day: 'Tue', signups: 6, trials: null },
    ];
    const series = seriesFromRows(rows, {
      x: (r) => r.day,
      series: [
        { id: 'signups', label: 'Signups', y: (r) => r.signups },
        { id: 'trials', label: 'Trials', y: (r) => r.trials, comparison: true },
      ],
    });
    expect(series[1]?.points[1]).toEqual({ x: 'Tue', y: null, datum: rows[1] });
    expect(series[1]?.comparison).toBe(true);
    expect(valueFormatter({ unit: 'cents' })(123_456)).toBe('$1,234.56');
    expect(valueFormatter({ unit: 'percent' })(0.25)).toBe('25%');
    expect(valueFormatter()(null)).toBe('—');
    expect(tickFormatter({ unit: 'cents', currency: 'EUR' })(1_250_000)).toBe('€12.5K');
    expect([
      ...comboRoles([
        cats('a', 'A', {}),
        cats('b', 'B', {}),
        cats('c', 'C', {}, { type: 'bar', axis: 'right' }),
      ]),
    ]).toEqual([
      ['a', { type: 'bar', axis: 'left' }],
      ['b', { type: 'line', axis: 'right' }],
      ['c', { type: 'bar', axis: 'right' }],
    ]);
  });
});

describe('LineChart and AreaChart', () => {
  const series = [
    daily('signups', 'Signups', [10, 14, 12, 18, 21, 19, 25]),
    daily('previous', 'Previous period', [8, 9, 11, 10, 14, 15, 13], { comparison: true }),
  ];

  it('draws one line per visible series, the comparison dashed, and hides series through the legend', async () => {
    render(LineChart, { title: 'Signups', series });
    expect(screen.getByRole('figure', { name: 'Signups' })).toBeTruthy();
    expect(lines()).toHaveLength(2);
    const dashed = [...lines()].filter((l) => l.getAttribute('stroke-dasharray'));
    expect(dashed).toHaveLength(1);
    expect(dashed[0]?.closest('[data-series]')?.getAttribute('data-series')).toBe('previous');
    await fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    expect(lines()).toHaveLength(1);
    // The last visible series cannot be hidden.
    await fireEvent.click(screen.getByRole('button', { name: 'Signups' }));
    expect(lines()).toHaveLength(1);
  });

  it('downsamples dense series with LTTB to about two points per pixel', () => {
    const dense = daily(
      'requests',
      'Requests',
      Array.from({ length: 10_000 }, (_, i) =>
        Math.round(100 + 50 * Math.sin(i / 200) + (i === 5000 ? 900 : 0))
      )
    );
    render(LineChart, { title: 'Requests', series: [dense], curve: 'linear' });
    const d = lines()[0]?.getAttribute('d') ?? '';
    const segments = (d.match(/[ML]/g) ?? []).length;
    // Plot width 600 − 40 − 12 = 548 px → threshold 1,096 points.
    expect(segments).toBeLessThanOrEqual(1096);
    expect(segments).toBeGreaterThan(900);
  });

  it('stacks areas so the top series ends at the total', () => {
    render(AreaChart, {
      title: 'Plans',
      stacked: true,
      series: [daily('free', 'Free', [10, 10, 10]), daily('pro', 'Pro', [30, 30, 30])],
    });
    const paths = document.querySelectorAll('[data-series] path:not([data-line])');
    expect(paths).toHaveLength(2);
    // Domain nices to 0…40: the pro line (top of the stack, 40) sits at the plot top (y = 8).
    const top = lines()[1]?.getAttribute('d') ?? '';
    expect(top.startsWith('M')).toBe(true);
    expect(Number(top.split(',')[1]?.match(/^-?[\d.]+/)?.[0])).toBeCloseTo(8, 1);
  });

  it('opens the same data as a table', async () => {
    render(LineChart, { title: 'Signups', series, unit: 'compact' });
    await fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    const table = await screen.findByRole('table', { name: 'Signups' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(screen.queryByRole('group', { name: /^Signups/ })).toBeNull();
  });

  it('shows the empty state when every value is missing', () => {
    render(LineChart, {
      title: 'Nothing',
      series: [daily('a', 'A', [null, null])],
      emptyMessage: 'No signups yet',
    });
    expect(screen.getByText('No signups yet')).toBeTruthy();
  });
});

describe('BarChart', () => {
  const quarterly = [
    cats('north', 'North', { Q1: 10, Q2: 30, Q3: -10, Q4: 20 }),
    cats('south', 'South', { Q1: 20, Q2: 10, Q3: 15, Q4: null }),
  ];

  it('draws grouped bars per series and category, with negatives below zero', () => {
    render(BarChart, { title: 'Revenue', series: quarterly, showValues: true });
    expect(bars()).toHaveLength(7);
    const north = bars('north');
    const q3 = north[2] as SVGRectElement;
    const q1 = north[0] as SVGRectElement;
    // The negative bar starts where positive bars end: at the zero line.
    expect(num(q3, 'y')).toBeCloseTo(num(q1, 'y') + num(q1, 'height'), 5);
    expect(document.querySelectorAll('text.fill-foreground')).toHaveLength(7);
  });

  it('stacks to totals and expands to 100 %', async () => {
    const view = render(BarChart, {
      title: 'Plans',
      mode: 'stacked',
      series: [cats('free', 'Free', { A: 10, B: 30 }), cats('pro', 'Pro', { A: 20, B: 10 })],
    });
    const heightOf = (j: number) =>
      bars()
        .filter((r) => r.dataset.bar?.endsWith(`:${j}`))
        .reduce((s, r) => s + num(r, 'height'), 0);
    // Totals 30 and 40 on a 0…40 axis.
    expect(heightOf(1)).toBeCloseTo(PLOT_HEIGHT, 5);
    expect(heightOf(0)).toBeCloseTo((PLOT_HEIGHT * 30) / 40, 5);
    await view.rerender({
      title: 'Plans',
      mode: 'expanded',
      series: [cats('free', 'Free', { A: 10, B: 30 }), cats('pro', 'Pro', { A: 20, B: 10 })],
    });
    expect(heightOf(0)).toBeCloseTo(PLOT_HEIGHT, 5);
    expect(heightOf(1)).toBeCloseTo(PLOT_HEIGHT, 5);
  });

  it('lays bars out horizontally', () => {
    render(BarChart, {
      title: 'Top pages',
      orientation: 'horizontal',
      series: [cats('views', 'Views', { Home: 40, Pricing: 20 })],
    });
    const [home, pricing] = bars();
    expect(num(home as Element, 'width')).toBeCloseTo(2 * num(pricing as Element, 'width'), 5);
    expect(num(pricing as Element, 'y')).toBeGreaterThan(num(home as Element, 'y'));
  });

  it('hides a series from the legend and widens the remaining bars', async () => {
    render(BarChart, { title: 'Revenue', series: quarterly });
    const before = num(bars('north')[0] as Element, 'width');
    await fireEvent.click(screen.getByRole('button', { name: 'South' }));
    expect(bars('south')).toHaveLength(0);
    expect(num(bars('north')[0] as Element, 'width')).toBeGreaterThan(before * 1.8);
  });

  it('reaches every bar with the keyboard', async () => {
    const onselect = vi.fn();
    render(BarChart, { title: 'Revenue', series: quarterly, onselect });
    const svg = chart('Revenue');
    await fireEvent.focus(svg);
    const seen = new Set([live()]);
    for (const key of [
      'ArrowRight',
      'ArrowRight',
      'ArrowRight',
      'PageDown',
      'ArrowLeft',
      'ArrowLeft',
    ]) {
      await fireEvent.keyDown(svg, { key });
      seen.add(live());
    }
    // 4 North bars + 3 South bars (South Q4 is missing and skipped).
    expect(seen.size).toBe(7);
    expect([...seen].some((t) => t.startsWith('South, Q1'))).toBe(true);
    await fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onselect.mock.calls[0]?.[0]).toMatchObject({ index: 0 });
    expect(onselect.mock.calls[0]?.[0].series.id).toBe('south');
  });
});

describe('ComboChart', () => {
  it('draws bars on the left axis and a line on the right, and labels the axes in the legend', () => {
    render(ComboChart, {
      title: 'Revenue and margin',
      leftUnit: 'cents',
      rightUnit: 'percent',
      series: [
        cats('revenue', 'Revenue', { Jan: 1_200_000, Feb: 1_500_000, Mar: 1_350_000 }),
        cats('margin', 'Margin', { Jan: 0.31, Feb: 0.34, Mar: 0.29 }),
      ],
    });
    expect(bars('revenue')).toHaveLength(3);
    expect(document.querySelectorAll('path[data-line="margin"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Revenue (left axis)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Margin (right axis)' })).toBeTruthy();
    expect(document.querySelector('[data-axis="right"]')?.textContent).toContain('%');
    expect(document.querySelector('[data-axis="left"]')?.textContent).toContain('$');
  });
});

describe('ScatterChart', () => {
  it('draws one symbol per point, area-true bubbles and a symbol per series', () => {
    render(ScatterChart, {
      title: 'Accounts',
      series: [
        {
          id: 'smb',
          label: 'SMB',
          points: [
            { x: 1, y: 2, size: 1 },
            { x: 3, y: 5, size: 100 },
          ],
        },
        { id: 'ent', label: 'Enterprise', points: [{ x: 2, y: 4, size: 25 }] },
      ],
    });
    const marks = [...document.querySelectorAll<SVGPathElement>('[data-mark]')];
    expect(marks).toHaveLength(3);
    const width = (m: SVGPathElement) => {
      const xs = [...(m.getAttribute('d') ?? '').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((x) =>
        Number(x[1])
      );
      return Math.max(...xs) - Math.min(...xs);
    };
    const [small, big] = marks.filter((m) => m.dataset.series === 'smb') as [
      SVGPathElement,
      SVGPathElement,
    ];
    expect(width(big)).toBeGreaterThan(width(small) * 2.5);
    // Different series use different symbols (circle paths use arcs, the second series does not).
    expect(small.getAttribute('d')).toContain('A');
    expect(marks.find((m) => m.dataset.series === 'ent')?.getAttribute('d')).not.toContain('A');
  });
});
