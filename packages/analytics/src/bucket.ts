import { type Accumulator, type Aggregate, createAccumulator } from './aggregate.ts';
import { DAY_MS, type DateRange } from './range.ts';
import type { Granularity } from './schema.ts';

/*
 * UTC time buckets for analytics series. Every bucket in the range is
 * returned, including empty ones, so charts never skip a quiet day.
 */

const HOUR_MS = 3_600_000;

/** One bucket of a series: bucket start (epoch ms, UTC) and value (null when there is nothing to measure). */
export interface SeriesPoint {
  at: number;
  value: number | null;
}

/** More buckets than this almost always means a wrong granularity for the range. */
export const MAX_BUCKETS = 10_000;

export interface BucketOptions {
  /** First day of a week, 0 = Sunday … 6 = Saturday (default 1, Monday as in ISO 8601). */
  weekStartsOn?: number;
}

/** Start of the bucket containing `ms`. */
export function bucketStart(
  ms: number,
  granularity: Granularity,
  options: BucketOptions = {}
): number {
  switch (granularity) {
    case 'hour':
      return Math.floor(ms / HOUR_MS) * HOUR_MS;
    case 'day':
      return Math.floor(ms / DAY_MS) * DAY_MS;
    case 'week': {
      const day = Math.floor(ms / DAY_MS) * DAY_MS;
      const weekStartsOn = options.weekStartsOn ?? 1;
      const back = (new Date(day).getUTCDay() - weekStartsOn + 7) % 7;
      return day - back * DAY_MS;
    }
    case 'month': {
      const d = new Date(ms);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
  }
}

/** Start of the bucket after the one starting at `start`. */
export function nextBucket(start: number, granularity: Granularity): number {
  switch (granularity) {
    case 'hour':
      return start + HOUR_MS;
    case 'day':
      return start + DAY_MS;
    case 'week':
      return start + 7 * DAY_MS;
    case 'month': {
      const d = new Date(start);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
  }
}

/** Starts of every bucket overlapping `[range.start, range.end)`. */
export function bucketStarts(
  range: DateRange,
  granularity: Granularity,
  options: BucketOptions = {}
): number[] {
  const out: number[] = [];
  if (!(range.end > range.start)) return out;
  for (
    let t = bucketStart(range.start, granularity, options);
    t < range.end;
    t = nextBucket(t, granularity)
  ) {
    out.push(t);
    if (out.length > MAX_BUCKETS) {
      throw new RangeError(
        `bucketStarts(): more than ${MAX_BUCKETS} ${granularity} buckets; use a coarser granularity`
      );
    }
  }
  return out;
}

export interface BucketizeOptions<R> extends BucketOptions {
  range: DateRange;
  granularity: Granularity;
  /** The row's instant: epoch ms or an ISO string. */
  at: (row: R) => number | string;
  /** What to aggregate (default: count rows). */
  aggregate?: Aggregate;
  /** The value for sum/avg/min/max/percentiles, or the key for `unique`. */
  value?: (row: R) => number | string | null | undefined;
}

/**
 * Aggregates rows into a complete UTC series over the range. Rows outside the
 * range are ignored. Empty buckets are 0 for count/sum/unique and null for
 * avg/min/max/percentiles (nothing to measure).
 */
export function bucketize<R>(rows: Iterable<R>, options: BucketizeOptions<R>): SeriesPoint[] {
  const kind = options.aggregate ?? 'count';
  const starts = bucketStarts(options.range, options.granularity, options);
  const accumulators = starts.map(() => createAccumulator(kind));
  const fixed = options.granularity === 'hour' || options.granularity === 'day';
  const size = options.granularity === 'hour' ? HOUR_MS : DAY_MS;
  const first = starts[0] ?? 0;

  for (const row of rows) {
    const raw = options.at(row);
    const t = typeof raw === 'number' ? raw : Date.parse(raw);
    if (!(t >= options.range.start && t < options.range.end)) continue;
    let index: number;
    if (fixed) index = Math.floor((t - first) / size);
    else {
      // Binary search: weeks and months are few, and months vary in length.
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if ((starts[mid] as number) <= t) lo = mid;
        else hi = mid - 1;
      }
      index = lo;
    }
    const acc = accumulators[index];
    if (!acc) continue;
    if (kind === 'count') acc.add(1);
    else {
      const v = options.value?.(row);
      if (v !== null && v !== undefined) acc.add(v);
    }
  }
  return starts.map((at, i) => ({ at, value: (accumulators[i] as Accumulator).result() }));
}
