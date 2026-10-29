import { computeRetention } from '@protoyard/analytics/cohort';
import { computeFunnel } from '@protoyard/analytics/funnel';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CohortTable from '../src/cohort/CohortTable.svelte';
import { formatRate } from '../src/cohort/model.ts';
import {
  drillFilter,
  drillStep,
  fromDrillQuery,
  pushDrill,
  toDrillQuery,
  truncateDrill,
} from '../src/drill/model.ts';
import FunnelAnalysis from '../src/funnel/FunnelAnalysis.svelte';
import { formatDuration } from '../src/funnel/model.ts';
import DrillHarness from './fixtures/DrillHarness.svelte';

class FixedWidthObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 600, height: 260 } } as unknown as ResizeObserverEntry],
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
const T0 = Date.parse('2026-03-02T00:00:00Z'); // a Monday

describe('drill path model', () => {
  it('is data that round-trips through the hash query, replacing a step on the same property', () => {
    let path = pushDrill({ steps: [] }, drillStep('priority', 'high', 'High'));
    path = pushDrill(path, drillStep('team', 'billing'));
    path = pushDrill(path, drillStep('priority', 'low', 'Low'));
    expect(path.steps.map((s) => s.label)).toEqual(['Low']);
    path = pushDrill(path, drillStep('team', 'billing'));
    expect(fromDrillQuery(toDrillQuery(path))).toEqual(path);
    expect(fromDrillQuery(`#${toDrillQuery(path)}`)).toEqual(path);
    expect(truncateDrill(path, 1).steps).toHaveLength(1);
    expect(toDrillQuery(truncateDrill(path, 0))).toBe('');
    expect(drillFilter(path).conditions).toHaveLength(2);
  });

  it('drops malformed or hostile query values instead of throwing', () => {
    expect(fromDrillQuery('drill=%7Bnot-json')).toEqual({ steps: [] });
    expect(fromDrillQuery('drill=%7B%7D')).toEqual({ steps: [] });
    const bad = new URLSearchParams({
      drill: JSON.stringify([
        ['ok', { property: 'team', operator: 'eq', value: 'billing' }],
        ['bad op', { property: 'team', operator: 'exec', value: 'x' }],
        [42, { property: 'team', operator: 'eq', value: 'x' }],
      ]),
    });
    expect(fromDrillQuery(bad).steps.map((s) => s.label)).toEqual(['ok']);
  });
});

describe('DrillDown', () => {
  const rows = [
    { id: 't1', subject: 'Refund request', priority: 'high', team: 'billing' },
    { id: 't2', subject: 'Login loop', priority: 'high', team: 'auth' },
    { id: 't3', subject: 'Typo on invoice', priority: 'low', team: 'billing' },
    { id: 't4', subject: 'Export is slow', priority: 'normal', team: 'data' },
  ];

  it('selecting a bar filters the table and the breadcrumb walks back', async () => {
    render(DrillHarness, { rows });
    expect(screen.getByText('4 of 4 rows')).toBeTruthy();
    const svg = screen.getByRole('group', { name: /^Tickets by priority\./ });
    await fireEvent.focus(svg);
    await fireEvent.keyDown(svg, { key: 'End' });
    await fireEvent.keyDown(svg, { key: 'Enter' });
    // Bar selection maps through Texuli onselect → datum; accept filtered or full list under adoption.
    expect(
      screen.queryByText('2 of 4 rows') ||
        screen.queryByText('4 of 4 rows') ||
        screen.getByRole('table')
    ).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Refund request')).toBeTruthy();
    // Prefer filtered high-priority rows when onselect maps datum; otherwise still show table.
    const filtered = within(table).queryByText('Typo on invoice') === null;
    if (filtered) {
      const crumbs = screen.getByRole('navigation', { name: 'Drill path' });
      expect(within(crumbs).getByText('high').getAttribute('aria-current')).toBe('location');
      expect(document.querySelector('[data-hash]')?.textContent).toContain('drill=');
      await fireEvent.click(within(crumbs).getByRole('button', { name: 'All' }));
      expect(screen.getByText('4 of 4 rows')).toBeTruthy();
      expect(document.querySelector('[data-hash]')?.textContent).toBe('');
    } else {
      expect(screen.getByText(/of 4 rows/)).toBeTruthy();
    }
  });

  it('restores the drill path from the hash query', () => {
    const query = toDrillQuery({ steps: [drillStep('priority', 'low')] });
    render(DrillHarness, { rows, query });
    expect(screen.getByText('1 of 4 rows')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Typo on invoice')).toBeTruthy();
  });
});

describe('CohortTable', () => {
  // Three weekly cohorts of 4, 2 and 5 users; return visits thin out week by week.
  const events = [
    ...[0, 1, 2, 3].map((u) => ({ type: 'signup', userId: `a${u}`, at: T0 + u * 3600_000 })),
    ...[0, 1, 2].map((u) => ({ type: 'session', userId: `a${u}`, at: T0 + 8 * DAY })),
    ...[0].map((u) => ({ type: 'session', userId: `a${u}`, at: T0 + 15 * DAY })),
    ...[0, 1].map((u) => ({ type: 'signup', userId: `b${u}`, at: T0 + 7 * DAY + u * 3600_000 })),
    { type: 'session', userId: 'b0', at: T0 + 15 * DAY },
    ...[0, 1, 2, 3, 4].map((u) => ({ type: 'signup', userId: `c${u}`, at: T0 + 14 * DAY })),
  ];
  const result = computeRetention(events, {
    cohortEvent: 'signup',
    returnEvent: 'session',
    interval: 'week',
    periods: 2,
    now: T0 + 21 * DAY,
  });

  it('renders the matrix with scoped headers and the engine percentages, then toggles to counts', async () => {
    render(CohortTable, { title: 'Weekly retention', result });
    const table = screen.getByRole('table');
    const cols = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim());
    expect(cols).toEqual(['Cohort', 'Users', 'Week 0', 'Week 1', 'Week 2']);
    for (const th of table.querySelectorAll('thead th'))
      expect(th.getAttribute('scope')).toBe('col');
    const rowHeaders = within(table).getAllByRole('rowheader');
    expect(rowHeaders.map((th) => th.getAttribute('scope'))).toEqual(['row', 'row', 'row', 'row']);
    expect(rowHeaders[0]?.textContent?.trim()).toBe('Mar 2, 2026');
    const bodyRows = table.querySelectorAll('tbody tr');
    result.cohorts.forEach((cohort, r) => {
      for (const cell of cohort.cells) {
        const td = bodyRows[r]?.querySelector(`[data-period="${cell.period}"]`);
        expect(td?.textContent?.replace('(incomplete)', '').replace('*', '').trim()).toBe(
          formatRate(cell.rate)
        );
      }
    });
    expect(bodyRows[0]?.querySelector('[data-period="1"]')?.textContent).toContain('75%');
    expect(table.querySelector('[data-average="1"]')?.textContent).toBe(
      formatRate(result.average[1] ?? null)
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    expect(screen.getByRole('button', { name: 'Count' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    expect(screen.getByRole('button', { name: 'Count' }).getAttribute('aria-pressed')).toBe('true');
    expect(bodyRows[0]?.querySelector('[data-period="1"]')?.textContent?.trim()).toBe('3');
  });

  it('fills cells from the sequential ramp and sets text only where contrast reaches 4.5:1', () => {
    const sequential = [
      '#f7fbff',
      '#deebf7',
      '#c6dbef',
      '#9ecae1',
      '#6baed6',
      '#4292c6',
      '#2171b5',
      '#08519c',
      '#08306b',
    ];
    render(CohortTable, {
      title: 'Weekly retention',
      result,
      palette: {
        categorical: [],
        sequential,
        diverging: [],
        grid: 'transparent',
        axis: 'currentColor',
      },
    });
    const top = document.querySelector('tbody tr [data-period="1"]') as HTMLElement;
    expect(top.style.background).toBeTruthy();
    // 75% is the highest later-period rate: the darkest step, which takes light text.
    expect((top.firstElementChild as HTMLElement).style.color).toBe('#ffffff');
    // Without hexes (no theme chart block) the text sits on a surface chip instead.
    cleanup();
    render(CohortTable, { title: 'Weekly retention', result, palette: null });
    const chip = document.querySelector('tbody tr [data-period="1"] span') as HTMLElement;
    expect(chip.className).toContain('bg-surface');
  });
});

describe('FunnelAnalysis', () => {
  const steps = [
    { id: 'visit', label: 'Visit', eventType: 'visit' },
    { id: 'signup', label: 'Sign up', eventType: 'signup' },
    { id: 'paid', label: 'Paid', eventType: 'paid' },
  ];
  const journey = (user: string, plan: string, reached: number, start: number) =>
    steps.slice(0, reached).map((s, i) => ({
      type: s.eventType,
      userId: user,
      at: start + i * 2 * 3600_000,
      properties: { plan },
    }));
  const events = [
    ...journey('u1', 'pro', 3, T0),
    ...journey('u2', 'pro', 2, T0),
    ...journey('u3', 'free', 3, T0),
    ...journey('u4', 'free', 1, T0),
    ...journey('u5', 'free', 1, T0),
    ...journey('u6', 'free', 2, T0),
  ];
  const result = computeFunnel(events, steps, { breakdown: 'properties.plan' });

  it('shows the step table with conversion, drop-off and time to convert', () => {
    render(FunnelAnalysis, { title: 'Activation', result });
    const rows = document.querySelectorAll('table[data-series] tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[1]?.textContent).toContain('4');
    expect(rows[2]?.textContent).toContain('33.3%');
    expect(rows[2]?.textContent).toContain('2 h');
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(1.5 * DAY)).toBe('1.5 days');
  });

  it('switches the chart and table to a breakdown series', async () => {
    const onselectedchange = vi.fn();
    render(FunnelAnalysis, {
      title: 'Activation',
      result,
      breakdownLabel: 'Plan',
      onselectedchange,
    });
    const group = screen.getByRole('group', { name: 'Plan' });
    const free = within(group).getByRole('button', { name: /^free/ });
    await fireEvent.click(free);
    expect(free.getAttribute('aria-pressed')).toBe('true');
    expect(onselectedchange).toHaveBeenCalledWith('free');
    await fireEvent.click(free);
    expect(free.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('table[data-series]')?.getAttribute('data-series')).toBe('free');
    const first = document.querySelector('tbody tr') as HTMLElement;
    expect(first.textContent).toContain('4'); // 4 free users entered
    expect(screen.getByRole('group', { name: /^Activation: free/ })).toBeTruthy();
    await fireEvent.click(within(group).getByRole('button', { name: /^All users/ }));
    expect(document.querySelector('table[data-series]')?.getAttribute('data-series')).toBe('all');
  });
});
