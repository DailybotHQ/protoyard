import {
  bucketize,
  compileFilter,
  type DateRange,
  type FilterGroup,
  type Granularity,
  readProperty,
} from '@protoyard/analytics';
import type {
  AnalyticsDatabase,
  Annotation,
  DailyRollup,
  TrackedEvent,
} from '../database/schema.ts';
import { EVENT_LABELS } from './catalog.ts';

/**
 * Pure read-model helpers for the analytics screens. They take rows plus the
 * range and filters, so they are trivially testable; screens call them inside
 * `liveQuery` with the range and filter in `deps`.
 */

const iso = (ms: number) => new Date(ms).toISOString();

/** A project's events in `[start, end)`, read through the `at` index (ISO strings sort by time). */
export function eventsInRange(
  db: AnalyticsDatabase,
  range: DateRange,
  projectId: string
): Promise<TrackedEvent[]> {
  return db.events
    .where('at')
    .between(iso(range.start), iso(range.end), true, false)
    .filter((e) => e.projectId === projectId)
    .toArray();
}

/** A project's events of one type in a range, through the `[type+at]` index. */
export function eventsOfType(
  db: AnalyticsDatabase,
  type: string,
  range: DateRange,
  projectId: string
): Promise<TrackedEvent[]> {
  return db.events
    .where('[type+at]')
    .between([type, iso(range.start)], [type, iso(range.end)], true, false)
    .filter((e) => e.projectId === projectId)
    .toArray();
}

/** A project's daily rollups for the days a range touches (sampled projects only). */
export function rollupsInRange(
  db: AnalyticsDatabase,
  range: DateRange,
  projectId: string
): Promise<DailyRollup[]> {
  const from = iso(range.start).slice(0, 10);
  const to = iso(range.end - 1).slice(0, 10);
  return db.rollups
    .where('[projectId+day]')
    .between([projectId, from], [projectId, to], true, true)
    .toArray();
}

/** Total events in rollups (exact counts for the full stream). */
export const rollupTotal = (rows: readonly DailyRollup[], type?: string) =>
  rows.reduce((s, r) => s + (type === undefined || r.type === type ? r.count : 0), 0);

/** Daily totals from rollups as a chart series (`x` = day start, epoch ms). */
export function rollupSeries(
  rows: readonly DailyRollup[],
  range: DateRange,
  type?: string
): { x: number; y: number }[] {
  const DAY = 86_400_000;
  const start = Math.floor(range.start / DAY) * DAY;
  const days = Math.max(1, Math.ceil((range.end - start) / DAY));
  const totals = new Map<string, number>();
  for (const r of rows)
    if (type === undefined || r.type === type)
      totals.set(r.day, (totals.get(r.day) ?? 0) + r.count);
  return Array.from({ length: days }, (_, i) => {
    const at = start + i * DAY;
    return { x: at, y: totals.get(iso(at).slice(0, 10)) ?? 0 };
  });
}

/** Annotations inside a range, oldest first, with their position across it (0…1) for the strip. */
export function annotationMarks(
  annotations: readonly Annotation[],
  range: DateRange
): (Annotation & { position: number })[] {
  const span = Math.max(1, range.end - range.start);
  return annotations
    .map((a) => ({ ...a, position: (Date.parse(a.at) - range.start) / span }))
    .filter((a) => a.position >= 0 && a.position <= 1)
    .sort((a, b) => a.position - b.position);
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
