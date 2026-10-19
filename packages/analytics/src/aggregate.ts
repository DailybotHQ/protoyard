import { z } from 'zod';

/*
 * Aggregations shared by KPI tiles, charts and breakdowns. Streaming
 * accumulators let bucketize() aggregate in one pass over the rows.
 */

export const AggregateSchema = z.enum([
  'count',
  'sum',
  'unique',
  'avg',
  'min',
  'max',
  'p50',
  'p90',
  'p95',
]);
export type Aggregate = z.infer<typeof AggregateSchema>;

/** Aggregates that are 0 (not null) over no values. */
const ZERO_WHEN_EMPTY: ReadonlySet<Aggregate> = new Set(['count', 'sum', 'unique']);

export interface Accumulator {
  /** Adds a value; non-numbers are ignored except by `unique` (and `count`, which counts anything). */
  add(value: number | string): void;
  result(): number | null;
}

/**
 * Percentile with linear interpolation between closest ranks (the method
 * NumPy and spreadsheets use by default). `p` is 0…1. Null for no values.
 */
export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (rank - lo);
}

const PERCENTILES: Partial<Record<Aggregate, number>> = { p50: 0.5, p90: 0.9, p95: 0.95 };

export function createAccumulator(kind: Aggregate): Accumulator {
  let count = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const seen = kind === 'unique' ? new Set<number | string>() : null;
  const values: number[] | null = kind in PERCENTILES ? [] : null;
  return {
    add(value) {
      if (kind === 'count') {
        count++;
        return;
      }
      if (seen) {
        seen.add(value);
        return;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      count++;
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
      values?.push(value);
    },
    result() {
      switch (kind) {
        case 'count':
          return count;
        case 'unique':
          return seen?.size ?? 0;
        case 'sum':
          return sum;
        case 'avg':
          return count === 0 ? null : sum / count;
        case 'min':
          return count === 0 ? null : min;
        case 'max':
          return count === 0 ? null : max;
        default:
          return percentile(values ?? [], PERCENTILES[kind] as number);
      }
    },
  };
}

/** One-shot aggregate over values (`count` counts every entry). */
export function aggregate(
  values: Iterable<number | string | null | undefined>,
  kind: Aggregate
): number | null {
  const acc = createAccumulator(kind);
  for (const v of values) {
    if (v === null || v === undefined) continue;
    acc.add(v);
  }
  const result = acc.result();
  return result === null && ZERO_WHEN_EMPTY.has(kind) ? 0 : result;
}

export interface Delta {
  /** current − previous; null when either side is missing. */
  absolute: number | null;
  /** (current − previous) / |previous|; null when previous is 0 or missing (no meaningful %). */
  relative: number | null;
}

/** Period-over-period change for KPI tiles. */
export function delta(
  current: number | null | undefined,
  previous: number | null | undefined
): Delta {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return { absolute: null, relative: null };
  }
  const absolute = current - previous;
  return { absolute, relative: previous === 0 ? null : absolute / Math.abs(previous) };
}
