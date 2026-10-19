import { z } from 'zod';
import { bucketStart, nextBucket } from './bucket.ts';
import { eventsByUser, type FunnelEvent } from './funnel.ts';

/** Retention period length. */
export const RetentionIntervalSchema = z.enum(['day', 'week', 'month']);
export type RetentionInterval = z.infer<typeof RetentionIntervalSchema>;

/** How many periods a retention table shows (period 0 is the cohort itself). */
export const RetentionPeriodsSchema = z.number().int().min(1).max(52);

export interface ComputeRetentionOptions {
  /** Event that puts a user in a cohort (e.g. `signup`); default: the user's first event of any type. */
  cohortEvent?: string;
  /** Event that counts as returning (e.g. `session_start`); default: any event. */
  returnEvent?: string;
  interval: RetentionInterval;
  /** Periods after period 0 to show. */
  periods: number;
  /** "Now" from the simulated clock: periods that have not finished are flagged incomplete. */
  now: number;
  /**
   * `bounded` (default): a user counts in period N when active during period N.
   * `unbounded`: a user counts in period N when active in period N or any later one
   * (the share that had not churned yet), so rates never increase with N.
   */
  mode?: 'bounded' | 'unbounded';
  /** 0 = Sunday … 6 = Saturday for weekly cohorts (default 1, Monday). */
  weekStartsOn?: number;
}

export interface RetentionCell {
  period: number;
  /** Users counted; null for periods that have not started yet. */
  count: number | null;
  /** count / cohort size; null when the period has not started. */
  rate: number | null;
  /** The period has not finished at `now` (partial or future): read it with care. */
  incomplete: boolean;
}

export interface RetentionCohort {
  /** Cohort bucket start, epoch ms (UTC). */
  start: number;
  size: number;
  /** Period 0 … `periods`; period 0 is the cohort itself (rate 1). */
  cells: RetentionCell[];
}

export interface RetentionResult {
  interval: RetentionInterval;
  mode: 'bounded' | 'unbounded';
  cohorts: RetentionCohort[];
  /** Size-weighted average rate per period over complete cells only; null when none is complete. */
  average: (number | null)[];
}

/** Whole intervals from bucket `from` to bucket `to` (both bucket starts). */
function periodsBetween(from: number, to: number, interval: RetentionInterval): number {
  if (interval === 'month') {
    const a = new Date(from);
    const b = new Date(to);
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  }
  return Math.round((to - from) / ((interval === 'day' ? 1 : 7) * 86_400_000));
}

/**
 * Cohort retention matrix: users grouped by the bucket of their cohort
 * event, then counted per later period in which they returned.
 */
export function computeRetention<E extends FunnelEvent>(
  events: Iterable<E>,
  options: ComputeRetentionOptions
): RetentionResult {
  const mode = options.mode ?? 'bounded';
  const periods = Math.max(0, Math.floor(options.periods));
  const bucketOptions = { weekStartsOn: options.weekStartsOn ?? 1 };
  const bucket = (ms: number) => bucketStart(ms, options.interval, bucketOptions);
  const cohorts = new Map<number, { size: number; active: number[] }>();

  for (const list of eventsByUser(events).values()) {
    const joined = options.cohortEvent
      ? list.find((e) => e.event.type === options.cohortEvent)
      : list[0];
    if (!joined) continue;
    const start = bucket(joined.at);
    let cohort = cohorts.get(start);
    if (!cohort) {
      cohort = { size: 0, active: new Array<number>(periods + 1).fill(0) };
      cohorts.set(start, cohort);
    }
    cohort.size++;
    const seen = new Array<boolean>(periods + 1).fill(false);
    seen[0] = true;
    for (const e of list) {
      if (e.at < joined.at || e === joined) continue;
      if (options.returnEvent && e.event.type !== options.returnEvent) continue;
      const p = periodsBetween(start, bucket(e.at), options.interval);
      if (p >= 1 && p <= periods) seen[p] = true;
    }
    if (mode === 'unbounded')
      for (let p = periods - 1; p >= 1; p--) seen[p] = seen[p] || (seen[p + 1] as boolean);
    seen.forEach((hit, p) => {
      if (hit) (cohort.active[p] as number)++;
    });
  }

  const rows: RetentionCohort[] = [...cohorts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, c]) => {
      const cells: RetentionCell[] = [];
      let periodStart = start;
      for (let p = 0; p <= periods; p++) {
        const periodEnd = nextBucket(periodStart, options.interval);
        const started = periodStart <= options.now;
        const count = started ? (c.active[p] as number) : null;
        cells.push({
          period: p,
          count,
          rate: count === null ? null : c.size > 0 ? count / c.size : null,
          incomplete: periodEnd > options.now,
        });
        periodStart = periodEnd;
      }
      return { start, size: c.size, cells };
    });

  const average = Array.from({ length: periods + 1 }, (_, p) => {
    let users = 0;
    let retained = 0;
    for (const row of rows) {
      const cell = row.cells[p] as RetentionCell;
      if (cell.incomplete || cell.count === null) continue;
      users += row.size;
      retained += cell.count;
    }
    return users > 0 ? retained / users : null;
  });

  return { interval: options.interval, mode, cohorts: rows, average };
}
