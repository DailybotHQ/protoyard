import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarHeatmap from '../src/matrix/CalendarHeatmap.svelte';
import Heatmap from '../src/matrix/Heatmap.svelte';
import Histogram from '../src/matrix/Histogram.svelte';
import { rampScale } from '../src/matrix/model.ts';

class FixedWidthObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 760, height: 260 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

const html = document.documentElement;
const RAMP = [
  '#f5f3ff',
  '#ede9fe',
  '#ddd6fe',
  '#c4b5fd',
  '#a78bfa',
  '#8b5cf6',
  '#7c3aed',
  '#6d28d9',
  '#4c1d95',
];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedWidthObserver);
  // A theme with a chart block, so cells resolve real hex colors for contrast checks.
  const vars: Record<string, string> = { '--py-background': '#ffffff', '--py-surface': '#ffffff' };
  ['#7c3aed', '#0284c7', '#0d9488', '#b45309', '#be123c', '#4d7c0f', '#a21caf', '#0e7490'].forEach(
    (c, i) => {
      vars[`--py-chart${i + 1}`] = c;
    }
  );
  RAMP.forEach((c, i) => {
    vars[`--py-seq-${i + 1}`] = c;
    vars[`--py-div-${i + 1}`] = c;
  });
  for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  html.removeAttribute('style');
});

const live = () => document.querySelector('[data-chart-live]')?.textContent ?? '';
/** The chart itself (its label starts with the title and a full stop; the ramp legend is also a group). */
const chart = (title: string) => screen.getByRole('group', { name: new RegExp(`^${title}\\.`) });

describe('rampScale', () => {
  it('maps values onto the ramp and only offers text that reaches 4.5:1', () => {
    const palette = {
      mode: 'light' as const,
      categorical: [],
      sequential: RAMP,
      diverging: RAMP,
      repaired: [],
    };
    const ramp = rampScale([0, 50, 100, null], palette);
    expect(ramp.fill(0)).toBe('var(--py-seq-1)');
    expect(ramp.fill(100)).toBe('var(--py-seq-9)');
    expect(ramp.fill(null)).toBe('transparent');
    expect(ramp.text(100)).toBe('#ffffff');
    expect(ramp.text(0)).toBe('#111827');
    // #a78bfa (step 5 of 9 for 50): near-black reaches 4.5:1, white does not.
    expect(ramp.text(50)).toBe('#111827');
    expect(rampScale([1, 2], null).text(2)).toBeNull();
    const div = rampScale([-10, 0, 20], palette, { diverging: true });
    expect(div.fill(0)).toBe('var(--py-div-5)');
    expect(div.fill(-20)).toBe('var(--py-div-1)');
  });
});

describe('Heatmap', () => {
  const rows = ['Mon', 'Tue', 'Wed'];
  const cols = ['00', '06', '12', '18'];
  const values = [
    [1, 4, 12, 6],
    [0, 3, 15, null],
    [2, 5, 9, 4],
  ];

  it('draws one cell per value, shows readable text and the ramp extremes', () => {
    render(Heatmap, { title: 'Activity', rows, cols, values });
    expect(document.querySelectorAll('[data-heat-cell]')).toHaveLength(12);
    const empty = document.querySelector('[data-heat-cell="1:3"] rect');
    expect(empty?.getAttribute('stroke-dasharray')).toBe('2 2');
    const texts = [...document.querySelectorAll('[data-cell-text]')];
    // 11 values, but 9 maps to step 5 of 9 (#8b5cf6), where neither white (4.2:1) nor near-black (3.5:1) reaches 4.5:1.
    expect(texts.length).toBe(10);
    expect(document.querySelector('[data-heat-cell="2:2"] [data-cell-text]')).toBeNull();
    for (const t of texts) expect(['#ffffff', '#111827']).toContain(t.getAttribute('fill'));
    expect(document.querySelector('[data-ramp-min]')?.textContent).toBe('0');
    expect(document.querySelector('[data-ramp-max]')?.textContent).toBe('15');
    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Activity' })).toBeTruthy();
  });

  it('moves across rows and columns with the keyboard and selects a cell', async () => {
    const onselect = vi.fn();
    render(Heatmap, { title: 'Activity', rows, cols, values, onselect });
    const svg = chart('Activity');
    await fireEvent.focus(svg);
    expect(live()).toBe('Mon, 00: 1');
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(live()).toBe('Mon, 12: 12');
    await fireEvent.keyDown(svg, { key: 'ArrowDown' });
    expect(live()).toBe('Tue, 12: 15');
    await fireEvent.keyDown(svg, { key: 'End' });
    expect(live()).toBe('Tue, 18: —');
    await fireEvent.keyDown(svg, { key: 'Home' });
    expect(live()).toBe('Tue, 00: 0');
    await fireEvent.keyDown(svg, { key: 'ArrowUp' });
    await fireEvent.keyDown(svg, { key: 'ArrowUp' });
    expect(live()).toBe('Mon, 00: 1');
    await fireEvent.keyDown(svg, { key: 'End', ctrlKey: true });
    expect(live()).toBe('Wed, 18: 4');
    await fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onselect).toHaveBeenCalledWith({ row: 2, col: 3, value: 4 });
  });

  it('offers the same data as a table', async () => {
    render(Heatmap, { title: 'Activity', rows, cols, values });
    await fireEvent.click(await screen.findByRole('button', { name: 'View as table' }));
    const table = await screen.findByRole('table', { name: 'Activity' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(table.querySelectorAll('thead th')).toHaveLength(5);
  });
});

describe('CalendarHeatmap', () => {
  it('lays a year out in 53 week columns with month labels, and keeps missing days distinct from zero', async () => {
    const values: Record<string, number> = { '2026-01-01': 0, '2026-01-02': 4, '2026-06-15': 9 };
    render(CalendarHeatmap, {
      title: 'Contributions',
      start: '2026-01-01',
      end: '2026-12-31',
      values,
    });
    const days = document.querySelectorAll('[data-day]');
    expect(days).toHaveLength(365);
    const weeks = new Set([...days].map((d) => d.getAttribute('x')));
    expect(weeks.size).toBe(53);
    expect(document.querySelectorAll('[data-month]')).toHaveLength(12);
    const zero = document.querySelector('[data-day="2026-01-01"]');
    const missing = document.querySelector('[data-day="2026-01-03"]');
    expect(zero?.hasAttribute('data-empty')).toBe(false);
    expect(zero?.getAttribute('fill')).toBe('var(--py-seq-1)');
    expect(missing?.hasAttribute('data-empty')).toBe(true);
    expect(missing?.getAttribute('fill')).toBe('transparent');
    const svg = chart('Contributions');
    await fireEvent.focus(svg);
    expect(live()).toBe('Thursday, January 1, 2026: 0');
    // Down is the next weekday, right the same weekday next week.
    await fireEvent.keyDown(svg, { key: 'ArrowDown' });
    expect(live()).toBe('Friday, January 2, 2026: 4');
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(live()).toBe('Friday, January 9, 2026: no data');
    // Left from the first week's Thursday has nowhere to go: it stays.
    await fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    await fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(live()).toBe('Friday, January 2, 2026: 4');
  });
});

describe('Histogram', () => {
  const values = [1, 2, 2, 3, 3, 3, 4, 4, 9.5, 10];

  it('draws one bar per bin with mean and median rules', async () => {
    render(Histogram, { title: 'Session length', values, rules: ['mean', 'median'] });
    expect(document.querySelectorAll('[data-bin]')).toHaveLength(5);
    expect(document.querySelector('[data-rule="mean"]')?.textContent).toContain('mean 4.15');
    expect(document.querySelector('[data-rule="median"]')?.textContent).toContain('median 3');
    const svg = chart('Session length');
    await fireEvent.focus(svg);
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(live()).toBe('Count, 2–4: 5 values. Point 2 of 5.');
  });

  it('accepts explicit bins and shows the empty state', () => {
    render(Histogram, { title: 'Bins', values, bins: { thresholds: [5] } });
    expect(document.querySelectorAll('[data-bin]')).toHaveLength(2);
    cleanup();
    render(Histogram, { title: 'None', values: [], emptyMessage: 'No sessions yet' });
    expect(screen.getByText('No sessions yet')).toBeTruthy();
  });
});
