import {
  bucketize,
  compileFilter,
  type DateRange,
  type FilterGroup,
  type Granularity,
  readProperty,
} from '@protoyard/analytics';
import type { AnalyticsDatabase, TrackedEvent } from '../database/schema.ts';
import { EVENT_LABELS } from './catalog.ts';

/**
 * Pure read-model helpers for the analytics screens. They take rows plus the
 * range and filters, so they are trivially testable; screens call them inside
 * `liveQuery` with the range and filter in `deps`.
 */

const iso = (ms: number) => new Date(ms).toISOString();

/** Events in `[start, end)`, read through the `at` index (ISO strings sort by time). */
export function eventsInRange(db: AnalyticsDatabase, range: DateRange): Promise<TrackedEvent[]> {
  return db.events.where('at').between(iso(range.start), iso(range.end), true, false).toArray();
}

/** Events of one type in a range, through the `[type+at]` index. */
export function eventsOfType(
  db: AnalyticsDatabase,
  type: string,
  range: DateRange
): Promise<TrackedEvent[]> {
  return db.events
    .where('[type+at]')
    .between([type, iso(range.start)], [type, iso(range.end)], true, false)
    .toArray();
}

/** Applies a FilterBuilder / segment filter; an empty group keeps every event. */
export function applyFilter(
  events: readonly TrackedEvent[],
  filter: FilterGroup | null
): TrackedEvent[] {
  if (!filter || filter.conditions.length === 0) return [...events];
  const test = compileFilter(filter);
  return events.filter((e) => test(e));
}

export interface Kpis {
  activeUsers: number;
  signups: number;
  events: number;
  /** Upgrades per signup in the period, 0…1; null without signups. */
  upgradeRate: number | null;
}

export function kpis(events: readonly TrackedEvent[]): Kpis {
  const users = new Set<string>();
  let signups = 0;
  let upgrades = 0;
  for (const e of events) {
    users.add(e.userId);
    if (e.type === 'signup') signups++;
    else if (e.type === 'upgraded') upgrades++;
  }
  return {
    activeUsers: users.size,
    signups,
    events: events.length,
    upgradeRate: signups ? upgrades / signups : null,
  };
}

/** Daily active users per bucket: the KPI sparkline. */
export function activeUsersSeries(
  events: readonly TrackedEvent[],
  range: DateRange,
  granularity: Granularity
): number[] {
  return bucketize(events, {
    range,
    granularity,
    at: (e) => e.at,
    aggregate: 'unique',
    value: (e) => e.userId,
  }).map((p) => p.value ?? 0);
}

const label = (value: unknown) =>
  value === undefined || value === null || value === '' ? '(none)' : String(value);

/** Counts by a property path, largest first; the tail beyond `limit` folds into "Other". */
export function countBy(
  events: readonly TrackedEvent[],
  path: string,
  limit = 6
): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = label(readProperty(e, path));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: path === 'type' ? (EVENT_LABELS[key] ?? key) : key,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1).reduce((s, x) => s + x.count, 0);
  return [...sorted.slice(0, limit - 1), { key: '__other', label: 'Other', count: rest }];
}

export interface TrendSeries {
  id: string;
  label: string;
  points: { x: number; y: number | null }[];
}

/**
 * Event counts (or unique users) per bucket, one series per breakdown value
 * (top `limit`, by volume) or a single total when there is no breakdown.
 */
export function trendSeries(
  events: readonly TrackedEvent[],
  options: {
    range: DateRange;
    granularity: Granularity;
    breakdown?: string | null;
    measure?: 'events' | 'users';
    limit?: number;
  }
): TrendSeries[] {
  const bucket = (rows: readonly TrackedEvent[]) =>
    bucketize(rows, {
      range: options.range,
      granularity: options.granularity,
      at: (e) => e.at,
      ...(options.measure === 'users'
        ? { aggregate: 'unique' as const, value: (e: TrackedEvent) => e.userId }
        : {}),
    }).map((p) => ({ x: p.at, y: p.value }));
  if (!options.breakdown)
    return [
      {
        id: 'total',
        label: options.measure === 'users' ? 'Users' : 'Events',
        points: bucket(events),
      },
    ];
  const path = options.breakdown;
  const groups = countBy(events, path, options.limit ?? 5).filter((g) => g.key !== '__other');
  return groups.map((g) => ({
    id: g.key,
    label: g.label,
    points: bucket(events.filter((e) => label(readProperty(e, path)) === g.key)),
  }));
}
