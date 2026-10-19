import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import MetricCard from '../src/components/MetricCard.svelte';
import type { Customer, Order } from '../src/database/schema.ts';
import { dailyCounts, dailyRevenue, overviewTrends } from '../src/domain/metrics.ts';

afterEach(cleanup);

const NOW = new Date('2026-03-15T12:00:00Z');
const order = (createdAt: string, amountCents: number, status: Order['status'] = 'paid') =>
  ({ id: createdAt, customerId: 'c1', createdAt, amountCents, status }) as Order;

describe('overview trend series', () => {
  it('counts per UTC day, oldest first, and ignores the future and the window edge', () => {
    const counts = dailyCounts(
      [
        '2026-03-15T01:00:00Z',
        '2026-03-15T11:59:00Z',
        '2026-03-14T23:59:00Z',
        '2026-03-01T00:00:00Z', // 15 days back: outside a 14-day window
        '2026-03-15T13:00:00Z', // after the simulated now
      ],
      NOW,
      14
    );
    expect(counts).toHaveLength(14);
    expect(counts.at(-1)).toBe(2);
    expect(counts.at(-2)).toBe(1);
    expect(counts.reduce((s, n) => s + n, 0)).toBe(3);
  });

  it('keeps revenue in integer cents, matching the revenue chart data', () => {
    const orders = [
      order('2026-03-15T09:00:00Z', 12_550),
      order('2026-03-14T09:00:00Z', 9_900),
      order('2026-03-14T10:00:00Z', 5_000, 'pending'),
    ];
    const customers = [{ id: 'c1', createdAt: '2026-03-10T00:00:00Z' }] as Customer[];
    const trends = overviewTrends(customers, orders, NOW);
    expect(trends.revenue).toHaveLength(30);
    expect(trends.revenue.slice(-2)).toEqual([9_900, 12_550]);
    expect(trends.revenue.slice(-14)).toEqual(dailyRevenue(orders, NOW, 14).map((d) => d.total));
    expect(trends.orders.slice(-2)).toEqual([2, 1]);
    expect(trends.newCustomers.reduce((s, n) => s + n, 0)).toBe(1);
  });
});

describe('MetricCard', () => {
  it('renders the stat card with a spoken sparkline trend', () => {
    render(MetricCard, {
      label: 'Orders · 30 days',
      value: '42',
      delta: '+10%',
      trend: 'up',
      trendValues: [10, 12, 0, 20],
    });
    expect(screen.getByText('Orders · 30 days')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Trend: up 100% over 30 days/ })).toBeTruthy();
  });
});
