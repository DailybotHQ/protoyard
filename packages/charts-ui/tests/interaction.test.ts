import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChartTable from '../src/interaction/ChartTable.svelte';
import InteractivePlot from '../src/interaction/InteractivePlot.svelte';
import Legend from '../src/interaction/Legend.svelte';
import {
  type ChartFormatters,
  nearestIndex,
  type PlotSeries,
  stepIndex,
  stepSeries,
  tableRows,
  toggleSeries,
  tooltipPosition,
} from '../src/interaction/model.ts';
import TableToggle from '../src/interaction/TableToggle.svelte';

afterEach(cleanup);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu'];
const series: PlotSeries<{ id: string }>[] = [
  {
    id: 'signups',
    label: 'Signups',
    points: [10, 20, null, 40].map((v, i) => ({
      x: 50 + i * 100,
      y: v === null ? null : 200 - v,
      xValue: i,
      yValue: v,
      datum: { id: `s${i}` },
    })),
  },
  {
    id: 'trials',
    label: 'Trials',
    points: [5, 8, 12, 16].map((v, i) => ({
      x: 50 + i * 100,
      y: 200 - v * 2,
      xValue: i,
      yValue: v,
      datum: { id: `t${i}` },
    })),
  },
];
const formatters: ChartFormatters = {
  x: (v) => DAYS[Number(v)] ?? String(v),
  y: (v) => (v === null ? '—' : `${v} users`),
};
const plot = { x: 40, y: 10, width: 400, height: 180 };
const marks = createRawSnippet(() => ({ render: () => '<g data-testid="marks"></g>' }));

describe('interaction model', () => {
  it('steps over gaps and finds the nearest defined point', () => {
    const points = series[0]?.points ?? [];
    expect(stepIndex(points, 1, 1)).toBe(3);
    expect(stepIndex(points, 3, 1)).toBe(3);
    expect(stepIndex(points, 3, -1)).toBe(1);
    // x = 250 is a gap: the nearer defined neighbour wins (150 is 90 px from 240, 350 is 110 px).
    expect(nearestIndex(points, 240)).toBe(1);
    expect(nearestIndex(points, 290)).toBe(3);
    expect(nearestIndex([], 10)).toBe(-1);
  });

  it('moves across visible series only', () => {
    expect(stepSeries(series, new Set(), { series: 0, index: 1 }, 1)).toEqual({
      series: 1,
      index: 1,
    });
    expect(stepSeries(series, new Set(['trials']), { series: 0, index: 1 }, 1)).toEqual({
      series: 0,
      index: 1,
    });
    expect(stepSeries(series, new Set(), { series: 1, index: 2 }, -1)).toEqual({
      series: 0,
      index: 1,
    });
  });

  it('never hides the last visible series', () => {
    const ids = ['a', 'b'];
    expect([...toggleSeries(new Set(), 'a', ids)]).toEqual(['a']);
    expect([...toggleSeries(new Set(['a']), 'b', ids)]).toEqual(['a']);
    expect([...toggleSeries(new Set(['a']), 'a', ids)]).toEqual([]);
  });

  it('places the tooltip inside the frame, flipping at edges, never over the point', () => {
    const size = { width: 100, height: 40 };
    const bounds = { width: 400, height: 200 };
    expect(tooltipPosition({ x: 50, y: 100 }, size, bounds)).toEqual({ left: 62, top: 48 });
    expect(tooltipPosition({ x: 380, y: 100 }, size, bounds)).toEqual({ left: 268, top: 48 });
    expect(tooltipPosition({ x: 50, y: 10 }, size, bounds)).toEqual({ left: 62, top: 22 });
    for (const anchor of [
      { x: 395, y: 5 },
      { x: 5, y: 195 },
      { x: 200, y: 100 },
    ]) {
      const box = tooltipPosition(anchor, size, bounds);
      const covers =
        anchor.x >= box.left &&
        anchor.x <= box.left + 100 &&
        anchor.y >= box.top &&
        anchor.y <= box.top + 40;
      expect(covers, JSON.stringify(anchor)).toBe(false);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top + 40).toBeLessThanOrEqual(200);
    }
  });

  it('builds table rows over every x', () => {
    const rows = tableRows(series);
    expect(rows).toHaveLength(4);
    expect(rows[2]).toEqual({ xValue: 2, cells: [null, 12] });
  });
});

describe('InteractivePlot', () => {
  const setup = (props: Record<string, unknown> = {}) =>
    render(InteractivePlot, {
      label: 'Signups and trials',
      series,
      width: 480,
      height: 220,
      plot,
      formatters,
      children: marks,
      ...props,
    });
  const live = () => document.querySelector('[data-chart-live]')?.textContent;
  const chart = () => screen.getByRole('group', { name: /^Signups and trials/ });

  it('is one focusable chart that announces the first point on focus', async () => {
    setup();
    const svg = chart();
    expect(svg.getAttribute('aria-roledescription')).toBe('chart');
    expect(svg.getAttribute('tabindex')).toBe('0');
    expect(screen.getByTestId('marks')).toBeTruthy();
    await fireEvent.focus(svg);
    expect(live()).toBe('Signups, Mon: 10 users. Point 1 of 3.');
    const id = svg.getAttribute('aria-activedescendant');
    expect(id && document.getElementById(id)?.getAttribute('aria-label')).toBe(
      'Signups, Mon: 10 users. Point 1 of 3.'
    );
  });

  it('moves with arrows, Home and End (skipping gaps) and across series with Page keys', async () => {
    setup();
    const svg = chart();
    await fireEvent.focus(svg);
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(live()).toBe('Signups, Tue: 20 users. Point 2 of 3.');
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(live()).toBe('Signups, Thu: 40 users. Point 3 of 3.');
    await fireEvent.keyDown(svg, { key: 'Home' });
    expect(live()).toContain('Mon: 10 users');
    await fireEvent.keyDown(svg, { key: 'End' });
    await fireEvent.keyDown(svg, { key: 'PageDown' });
    expect(live()).toBe('Trials, Thu: 16 users. Point 4 of 4.');
    await fireEvent.keyDown(svg, { key: 'PageUp' });
    expect(live()).toBe('Signups, Thu: 40 users. Point 3 of 3.');
    // The tooltip lists every visible series at the focused x; Escape dismisses it.
    const tip = document.querySelector('[data-chart-tooltip]') as HTMLElement;
    expect(tip.textContent).toContain('Thu');
    expect(tip.textContent).toContain('40 users');
    expect(tip.textContent).toContain('16 users');
    expect(document.querySelector('[data-crosshair]')).toBeTruthy();
    await fireEvent.keyDown(svg, { key: 'Escape' });
    expect(document.querySelector('[data-chart-tooltip]')).toBeNull();
  });

  it('skips hidden series and selects with Enter for drill-down', async () => {
    const onselect = vi.fn();
    setup({ hidden: new Set(['signups']), onselect });
    const svg = chart();
    await fireEvent.focus(svg);
    expect(live()).toBe('Trials, Mon: 5 users. Point 1 of 4.');
    await fireEvent.keyDown(svg, { key: 'PageUp' });
    expect(live()).toContain('Trials');
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    await fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onselect).toHaveBeenCalledTimes(1);
    const selection = onselect.mock.calls[0]?.[0];
    expect(selection.series.id).toBe('trials');
    expect(selection.index).toBe(1);
    expect(selection.datum).toEqual({ id: 't1' });
  });

  it('follows the pointer to the nearest point and selects on click', async () => {
    const onselect = vi.fn();
    setup({ onselect });
    const svg = chart();
    await fireEvent.pointerMove(svg, { clientX: 148, clientY: 185 });
    const tip = document.querySelector('[data-chart-tooltip]') as HTMLElement;
    expect(tip.textContent).toContain('Tue');
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    await fireEvent.click(svg);
    // At Tue, Trials sits at y = 184 and Signups at y = 180: the pointer (y = 185) picks Trials.
    expect(onselect.mock.calls[0]?.[0].series.id).toBe('trials');
    await fireEvent.pointerLeave(svg);
    expect(document.querySelector('[data-chart-tooltip]')).toBeNull();
  });
});

describe('Legend', () => {
  it('toggles series with aria-pressed and keeps one visible', async () => {
    const onchange = vi.fn();
    const items = series.map((s) => ({ id: s.id, label: s.label }));
    const view = render(Legend, { items, onchange });
    const signups = screen.getByRole('button', { name: 'Signups' });
    expect(signups.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(signups);
    expect(onchange).toHaveBeenCalledWith(new Set(['signups']));

    await view.rerender({ items, onchange, hidden: new Set(['signups']) });
    expect(screen.getByRole('button', { name: 'Signups' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    const trials = screen.getByRole('button', { name: 'Trials' });
    expect(trials.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(trials);
    expect(onchange).toHaveBeenCalledTimes(1);
  });

  it('renders a static key without onchange', () => {
    render(Legend, { items: [{ id: 'a', label: 'Only' }] });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('list', { name: 'Series' })).toBeTruthy();
  });
});

describe('ChartTable and TableToggle', () => {
  it('renders the same data with the same formatters, noting hidden series', () => {
    render(ChartTable, {
      caption: 'Signups and trials',
      series,
      hidden: new Set(['trials']),
      formatters,
      xHeader: 'Day',
    });
    const table = screen.getByRole('table', { name: 'Signups and trials' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + 4);
    expect(within(table).getByRole('columnheader', { name: 'Trials (hidden)' })).toBeTruthy();
    expect(rows[3]?.textContent).toContain('Wed');
    expect(rows[3]?.textContent).toContain('—');
    expect(rows[3]?.textContent).toContain('12 users');
  });

  it('paginates long tables', async () => {
    const long: PlotSeries[] = [
      {
        id: 'v',
        label: 'Value',
        points: Array.from({ length: 120 }, (_, i) => ({ x: i, y: i, xValue: i, yValue: i })),
      },
    ];
    render(ChartTable, { caption: 'Long', series: long, formatters, pageSize: 50 });
    expect(screen.getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('Showing 50 of 120 rows')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(screen.getAllByRole('row')).toHaveLength(101);
    await fireEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
    expect(screen.getAllByRole('row')).toHaveLength(121);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('toggles between chart and table', async () => {
    render(TableToggle, { controls: 'chart-1' });
    const button = screen.getByRole('button', { name: 'View as table' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'View as chart' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });
});
