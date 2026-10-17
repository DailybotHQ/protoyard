import { MS_PER_DAY } from '@protoyard/core';
import { type Customer, type Order, REVENUE_STATUSES } from '../database/schema.ts';

/**
 * Pure read-model helpers for the Overview screen. They take rows and the
 * SIMULATED now, so they are trivially testable and follow time travel.
 */

export interface DailyTotal {
  /** ISO date (yyyy-mm-dd, UTC). */
  day: string;
  total: number;
  count: number;
}

export const isRevenue = (order: Order) => REVENUE_STATUSES.includes(order.status);

const sum = (orders: readonly Order[]) => orders.reduce((s, o) => s + o.amountCents, 0);

/** Percent change, or null when there is no previous value to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function overviewStats(customers: readonly Customer[], orders: readonly Order[], now: Date) {
  const t = now.getTime();
  const inWindow = (iso: string, fromDays: number, toDays: number) => {
    const at = Date.parse(iso);
    return at > t - fromDays * MS_PER_DAY && at <= t - toDays * MS_PER_DAY;
  };
  const revenue = orders.filter(isRevenue);
  const last30 = revenue.filter((o) => inWindow(o.createdAt, 30, 0));
  const prev30 = revenue.filter((o) => inWindow(o.createdAt, 60, 30));
  const ordersLast30 = orders.filter((o) => inWindow(o.createdAt, 30, 0));
  const ordersPrev30 = orders.filter((o) => inWindow(o.createdAt, 60, 30));
  const newCustomers = customers.filter((c) => inWindow(c.createdAt, 30, 0)).length;
  const prevNewCustomers = customers.filter((c) => inWindow(c.createdAt, 60, 30)).length;
  return {
    revenue30: sum(last30),
    revenueDelta: percentChange(sum(last30), sum(prev30)),
    orders30: ordersLast30.length,
    ordersDelta: percentChange(ordersLast30.length, ordersPrev30.length),
    activeCustomers: customers.filter((c) => c.status === 'active').length,
    newCustomers,
    newCustomersDelta: percentChange(newCustomers, prevNewCustomers),
    averageOrder: last30.length ? sum(last30) / last30.length : 0,
    pending: orders.filter((o) => o.status === 'pending').length,
  };
}

/** Revenue per UTC day for the last `days` days (oldest first), including empty days. */
export function dailyRevenue(orders: readonly Order[], now: Date, days = 14): DailyTotal[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const buckets: DailyTotal[] = Array.from({ length: days }, (_, i) => ({
    day: new Date(end - (days - 1 - i) * MS_PER_DAY).toISOString().slice(0, 10),
    total: 0,
    count: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.day, i]));
  for (const order of orders) {
    if (!isRevenue(order) || Date.parse(order.createdAt) > now.getTime()) continue;
    const bucket = buckets[index.get(order.createdAt.slice(0, 10)) ?? -1];
    if (bucket) {
      bucket.total += order.amountCents;
      bucket.count += 1;
    }
  }
  return buckets;
}

/** Lifetime value and order count per customer id. */
export function customerTotals(orders: readonly Order[]) {
  const totals = new Map<string, { orders: number; value: number }>();
  for (const order of orders) {
    const entry = totals.get(order.customerId) ?? { orders: 0, value: 0 };
    entry.orders += 1;
    if (isRevenue(order)) entry.value += order.amountCents;
    totals.set(order.customerId, entry);
  }
  return totals;
}
