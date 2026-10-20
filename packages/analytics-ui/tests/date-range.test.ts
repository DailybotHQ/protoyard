import {
  bucketStarts,
  MAX_BUCKETS,
  MAX_CUSTOM_RANGE_DAYS,
  resolveDateRange,
} from '@protoyard/analytics';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DateRangePanel from '../src/date-range/DateRangePanel.svelte';
import DateRangePicker from '../src/date-range/DateRangePicker.svelte';
import MonthGrid from '../src/date-range/MonthGrid.svelte';
import {
  allowedGranularities,
  type DateRangeValue,
  DEFAULT_DATE_RANGE,
  describeDateRange,
  fitGranularity,
  formatSpan,
  fromDateRangeQuery,
  monthGrid,
  toDateRangeQuery,
} from '../src/date-range/model.ts';

afterEach(cleanup);

const DAY = 86_400_000;
// Thursday 2026-03-19 15:00 UTC on the simulated clock.
const NOW = Date.parse('2026-03-19T15:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('date range model', () => {
  it('limits granularity by span and refits an invalid one', () => {
    expect(allowedGranularities({ start: 0, end: DAY })).toEqual(['hour', 'day']);
    expect(allowedGranularities({ start: 0, end: 30 * DAY })).toEqual(['day', 'week']);
    expect(allowedGranularities({ start: 0, end: 365 * DAY })).toEqual(['day', 'week', 'month']);
    expect(allowedGranularities({ start: 0, end: 800 * DAY })).toEqual(['week', 'month']);
    expect(fitGranularity('hour', { start: 0, end: 365 * DAY })).toBe('week');
    expect(fitGranularity('week', { start: 0, end: 30 * DAY })).toBe('week');
  });

  it('round-trips through the hash query and ignores invalid parts', () => {
    const values: DateRangeValue[] = [
      DEFAULT_DATE_RANGE,
      {
        range: { kind: 'preset', preset: 'quarter-to-date' },
        comparison: 'none',
        granularity: 'week',
      },
      {
        range: { kind: 'custom', start: '2026-03-01', end: '2026-03-07' },
        comparison: 'previous-year',
        granularity: 'hour',
      },
    ];
    for (const value of values) expect(fromDateRangeQuery(toDateRangeQuery(value))).toEqual(value);
    expect(toDateRangeQuery(values[2] as DateRangeValue)).toBe(
      'range=2026-03-01..2026-03-07&compare=previous-year&by=hour'
    );
    expect(fromDateRangeQuery('?range=last-8-days&compare=sometimes&by=year')).toEqual(
      DEFAULT_DATE_RANGE
    );
    expect(fromDateRangeQuery('range=2026-03-09..2026-03-01').range).toEqual(
      DEFAULT_DATE_RANGE.range
    );
    expect(fromDateRangeQuery('').comparison).toBe('previous-period');
  });

  it('fits a shared granularity to the range and caps custom spans', () => {
    // A long custom range cannot keep hourly buckets.
    const long = fromDateRangeQuery('range=2020-01-01..2029-12-31&by=hour');
    expect(long.range).toEqual({ kind: 'custom', start: '2020-01-01', end: '2029-12-31' });
    expect(long.granularity).toBe('month');
    const resolved = resolveDateRange(long.range, 0);
    expect(bucketStarts(resolved, long.granularity).length).toBeLessThanOrEqual(MAX_BUCKETS);
    // Wider than the cap: the range falls back to the default instead of throwing later.
    const huge = fromDateRangeQuery('range=2000-01-01..2030-01-01&by=hour');
    expect(huge.range).toEqual(DEFAULT_DATE_RANGE.range);
    expect(huge.granularity).toBe(DEFAULT_DATE_RANGE.granularity);
    expect(MAX_CUSTOM_RANGE_DAYS).toBe(3660);
    // A preset is fitted when the clock is known.
    expect(
      fromDateRangeQuery('range=year-to-date&by=hour', DEFAULT_DATE_RANGE, NOW).granularity
    ).not.toBe('hour');
    // A granularity the range allows is kept.
    expect(fromDateRangeQuery('range=2026-03-01..2026-03-07&by=hour').granularity).toBe('hour');
  });

  it('describes ranges and comparisons', () => {
    expect(formatSpan({ start: Date.parse('2026-03-01'), end: Date.parse('2026-03-08') })).toBe(
      'Mar 1 – Mar 7, 2026'
    );
    expect(formatSpan({ start: Date.parse('2025-12-30'), end: Date.parse('2026-01-03') })).toBe(
      'Dec 30, 2025 – Jan 2, 2026'
    );
    const d = describeDateRange(DEFAULT_DATE_RANGE, NOW);
    expect(d.label).toBe('Last 30 days');
    expect(iso(d.range.start)).toBe('2026-02-18T00:00:00.000Z');
    expect(d.comparedSpan).toBe('Jan 19 – Feb 17, 2026');
  });

  it('builds Monday-first month grids', () => {
    const march = monthGrid(2026, 2);
    expect(march).toHaveLength(6);
    expect(march[0]?.[0]).toMatchObject({ date: '2026-02-23', inMonth: false });
    expect(march[0]?.[6]).toMatchObject({ date: '2026-03-01', day: 1, inMonth: true });
    expect(monthGrid(2027, 1)).toHaveLength(4); // Feb 2027 starts on a Monday: four full weeks
    expect(monthGrid(2026, 1)).toHaveLength(5); // Feb 2026 starts on a Sunday
    expect(monthGrid(2026, 2, 0)[0]?.[0]?.date).toBe('2026-03-01');
  });
});

describe('DateRangePanel', () => {
  const setup = (value: DateRangeValue = DEFAULT_DATE_RANGE) => {
    const onchange = vi.fn();
    const view = render(DateRangePanel, { value, now: NOW, onchange });
    return { onchange, view };
  };

  it('emits a preset range against the fixed clock, refitting the granularity', async () => {
    const { onchange } = setup({ ...DEFAULT_DATE_RANGE, granularity: 'hour' });
    const presets = screen.getByRole('group', { name: 'Preset ranges' });
    expect(
      within(presets).getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')
    ).toBe('true');
    await fireEvent.click(within(presets).getByRole('button', { name: 'Year to date' }));
    const [value, change] = onchange.mock.calls[0] ?? [];
    expect(change).toBe('range');
    expect(value).toEqual({
      range: { kind: 'preset', preset: 'year-to-date' },
      comparison: 'previous-period',
      granularity: 'day',
    });
    expect(iso(describeDateRange(value, NOW).range.start)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('changes comparison and only offers granularities the range allows', async () => {
    const { onchange } = setup();
    await fireEvent.click(
      within(screen.getByRole('group', { name: 'Compare to' })).getByRole('button', {
        name: 'Previous year',
      })
    );
    expect(onchange).toHaveBeenLastCalledWith(
      { ...DEFAULT_DATE_RANGE, comparison: 'previous-year' },
      'comparison'
    );
    const groupBy = screen.getByRole('group', { name: 'Group by' });
    expect(
      (within(groupBy).getByRole('button', { name: 'Hour' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (within(groupBy).getByRole('button', { name: 'Month' }) as HTMLButtonElement).disabled
    ).toBe(true);
    await fireEvent.click(within(groupBy).getByRole('button', { name: 'Week' }));
    expect(onchange).toHaveBeenLastCalledWith(
      { ...DEFAULT_DATE_RANGE, granularity: 'week' },
      'granularity'
    );
    expect(document.querySelector('[data-range-summary]')?.textContent).toContain(
      'compared with Jan 19 – Feb 17, 2026'
    );
  });

  it('picks a custom range on the calendar and applies it', async () => {
    const { onchange } = setup();
    const apply = screen.getByRole('button', { name: 'Apply range' });
    expect(apply.hasAttribute('disabled')).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Tuesday, March 10, 2026' }));
    expect(screen.getByText('Pick an end day')).toBeTruthy();
    // Picking an earlier end day swaps the two.
    await fireEvent.click(screen.getByRole('button', { name: 'Thursday, March 5, 2026' }));
    expect(screen.getByText('Mar 5 – Mar 10, 2026')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(onchange).toHaveBeenLastCalledWith(
      { ...DEFAULT_DATE_RANGE, range: { kind: 'custom', start: '2026-03-05', end: '2026-03-10' } },
      'range'
    );
  });
});

describe('MonthGrid keyboard', () => {
  it('moves focus by day, week, week edge and month, and never picks future days', async () => {
    const onpick = vi.fn();
    render(MonthGrid, { initial: '2026-03-18', max: NOW, onpick });
    const grid = screen.getByRole('grid', { name: 'March 2026' });
    const focusedDate = () => (document.activeElement as HTMLElement | null)?.dataset.date;
    const start = grid.querySelector<HTMLButtonElement>('[data-date="2026-03-18"]');
    expect(start?.tabIndex).toBe(0);
    start?.focus();
    const key = async (k: string, shiftKey = false) => {
      await fireEvent.keyDown(document.activeElement as Element, { key: k, shiftKey });
      await waitFor(() => expect(document.activeElement?.tagName).toBe('BUTTON'));
    };
    await key('ArrowRight');
    expect(focusedDate()).toBe('2026-03-19');
    await key('ArrowUp');
    expect(focusedDate()).toBe('2026-03-12');
    await key('Home');
    expect(focusedDate()).toBe('2026-03-09');
    await key('End');
    expect(focusedDate()).toBe('2026-03-15');
    await key('PageUp');
    expect(focusedDate()).toBe('2026-02-15');
    expect(screen.getByRole('grid', { name: 'February 2026' })).toBeTruthy();
    await key('PageDown', true);
    expect(focusedDate()).toBe('2027-02-15');
    await key('PageUp', true);
    await key('PageDown');
    await key('ArrowDown');
    expect(focusedDate()).toBe('2026-03-22');
    // The 22nd is after "now": it can be focused but not picked.
    expect((document.activeElement as HTMLElement).getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(document.activeElement as Element);
    expect(onpick).not.toHaveBeenCalled();
    await key('ArrowLeft');
    await fireEvent.click(screen.getByRole('button', { name: 'Thursday, March 19, 2026' }));
    expect(onpick).toHaveBeenCalledWith('2026-03-19');
  });

  it('marks the selected span', () => {
    render(MonthGrid, {
      initial: '2026-03-10',
      start: '2026-03-05',
      end: '2026-03-07',
      onpick: () => {},
    });
    const selected = [
      ...document.querySelectorAll('[role="gridcell"][aria-selected="true"] button'),
    ].map((b) => (b as HTMLElement).dataset.date);
    expect(selected).toEqual(['2026-03-05', '2026-03-06', '2026-03-07']);
  });
});

describe('DateRangePicker', () => {
  it('shows the range and comparison on its trigger', () => {
    render(DateRangePicker, { value: DEFAULT_DATE_RANGE, now: new Date(NOW), onchange: () => {} });
    const trigger = screen.getByRole('button', { name: 'Date range: Last 30 days' });
    expect(trigger.textContent).toContain('vs previous period');
  });
});
