import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatKpi, kpiDelta } from '../src/kpi/format.ts';
import KpiRow from '../src/kpi/KpiRow.svelte';
import KpiTile from '../src/kpi/KpiTile.svelte';
import CounterHarness from './fixtures/CounterHarness.svelte';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset.txMotion;
});

describe('KPI formatting', () => {
  it('formats units and deltas, falling back to the absolute change over a zero base', () => {
    expect(formatKpi(123_456, 'cents')).toBe('$1,234.56');
    expect(formatKpi(250_000_000, 'cents')).toBe('$2.5M');
    expect(formatKpi(0.125, 'percent')).toBe('12.5%');
    expect(formatKpi(12_400, 'compact')).toBe('12.4K');
    expect(formatKpi(null)).toBe('—');
    expect(kpiDelta(1240, 1100)?.text).toBe('+12.7%');
    expect(kpiDelta(90, 100)).toMatchObject({ absolute: -10, relative: -0.1, text: '-10%' });
    expect(kpiDelta(12, 0)).toMatchObject({ relative: null, text: '+12' });
    expect(kpiDelta(5, null)).toBeNull();
  });
});

describe('KpiTile', () => {
  it('shows the value, the delta with its tone and the spoken direction', () => {
    render(KpiTile, {
      label: 'Signups',
      value: 1240,
      previous: 1100,
      trend: [900, 1000, 1100, 1240],
      trendPeriod: '4 weeks',
    });
    const tile = screen.getByRole('article', { name: 'Signups' });
    expect(within(tile).getAllByText(/1[,.]?240/)[0]).toBeTruthy();
    const delta = tile.querySelector('[data-kpi-delta]') as HTMLElement;
    expect(delta.dataset.kpiDelta).toBe('up');
    expect(delta.textContent).toContain('Increased:');
    expect(delta.textContent).toContain('+12.7%');
    expect(delta.textContent).toContain('vs previous period');
    expect(delta.querySelector('[data-tx-stat-delta]')).toBeTruthy();
    expect(
      tile.querySelector('svg, [data-py-sparkline], [data-py-chart]') ||
        document.querySelector('svg')
    ).toBeTruthy();
  });

  it("uses the destructive tone when a 'down is good' metric goes up, and success when it falls", async () => {
    const view = render(KpiTile, {
      label: 'Churn',
      value: 0.052,
      previous: 0.04,
      unit: 'percent',
      positive: 'down',
    });
    expect(document.querySelector('[data-kpi-delta] [data-trend="up"]')?.textContent).toContain(
      'Increased:'
    );
    await view.rerender({
      label: 'Churn',
      value: 0.03,
      previous: 0.04,
      unit: 'percent',
      positive: 'down',
    });
    const good = document.querySelector('[data-kpi-delta] [data-trend="down"]');
    expect(good?.textContent).toContain('Decreased:');
    expect(good?.textContent).toContain('-25%');
    await view.rerender({
      label: 'Churn',
      value: 0.04,
      previous: 0.04,
      unit: 'percent',
      positive: 'down',
    });
    expect(document.querySelector('[data-kpi-delta]')?.textContent).toContain('No change:');
  });

  it('turns into a drill link, and shows loading and empty states', async () => {
    const view = render(KpiTile, {
      label: 'Revenue',
      value: 5_000_000,
      unit: 'cents',
      href: '#/revenue',
    });
    const link = screen.getByRole('link', { name: 'Revenue' });
    expect(link.getAttribute('href')).toBe('#/revenue');
    expect(document.getElementById(link.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      '$50K'
    );
    await view.rerender({ label: 'Revenue', value: null, loading: true });
    expect(screen.getByRole('article').getAttribute('aria-busy')).toBe('true');
    await view.rerender({ label: 'Revenue', value: null, loading: false, empty: 'No orders yet' });
    expect(screen.getByText('No orders yet')).toBeTruthy();
  });

  it('lays tiles out in a responsive row', () => {
    const children = createRawSnippet(() => ({ render: () => '<div data-testid="tile">A</div>' }));
    render(KpiRow, { label: 'Key metrics', children });
    const row = screen.getByRole('region', { name: 'Key metrics' });
    expect(row.getAttribute('data-tx-kpi-row')).toBe('true');
    expect(row.style.getPropertyValue('--tx-kpi-row-min')).toBe('12rem');
  });
});

describe('LiveCounter', () => {
  const value = () => document.querySelector('[data-tx-stat-value]')?.textContent?.trim();
  const spoken = () => document.querySelector('[data-counter-live]')?.textContent;

  it('renders the final value immediately under reduced motion', async () => {
    document.documentElement.dataset.txMotion = 'reduce';
    const view = render(CounterHarness, { value: 10 });
    expect(value()).toBe('10');
    await view.rerender({ value: 250 });
    expect(value()).toBe('250');
    expect(document.querySelector('[data-live-counter]')?.getAttribute('data-motion')).toBe(
      'reduce'
    );
  });

  it('counts up to the new value when motion is allowed', async () => {
    const view = render(CounterHarness, { value: 10, duration: 120 });
    expect(value()).toBe('10');
    await view.rerender({ value: 110, duration: 120 });
    await waitFor(() => expect(value()).toBe('110'), { timeout: 2000 });
  });

  it('throttles announcements to one per interval with the latest value', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    document.documentElement.dataset.txMotion = 'reduce';
    const view = render(CounterHarness, { value: 1, announceEvery: 5000 });
    expect(spoken()).toBe('Active users: 1');
    await view.rerender({ value: 2, announceEvery: 5000 });
    await view.rerender({ value: 3, announceEvery: 5000 });
    expect(spoken()).toBe('Active users: 1');
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(spoken()).toBe('Active users: 3');
  });
});
