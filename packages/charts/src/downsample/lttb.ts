import type { ChartPoint } from '../types.ts';

/*
 * Largest-Triangle-Three-Buckets (Steinarsson, 2013): keeps the first and
 * last point and, in each bucket between them, the point that forms the
 * largest triangle with the previously kept point and the next bucket's
 * average. Lines keep their visual shape with a fraction of the points.
 * Inputs must be sorted by x. Output is deterministic (no randomness).
 */

/**
 * Indices LTTB keeps from parallel `xs`/`ys` columns (plain arrays or typed
 * arrays). Returns every index when `xs.length <= threshold`. Non-finite y
 * values are never chosen inside a bucket; use `largestTriangleThreeBuckets`
 * on points to keep gaps.
 */
export function lttbIndices(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  threshold: number
): number[] {
  const n = Math.min(xs.length, ys.length);
  const keep = Math.floor(threshold);
  if (n <= keep || n <= 2) return Array.from({ length: n }, (_, i) => i);
  if (keep < 3) return keep <= 0 ? [] : keep === 1 ? [0] : [0, n - 1];

  const out: number[] = [0];
  const bucketSize = (n - 2) / (keep - 2);
  let a = 0;
  for (let bucket = 0; bucket < keep - 2; bucket++) {
    const start = Math.floor(bucket * bucketSize) + 1;
    const end = Math.min(Math.floor((bucket + 1) * bucketSize) + 1, n - 1);

    // Average of the next bucket (the last point for the final bucket).
    const nextStart = end;
    const nextEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, n);
    let avgX = 0;
    let avgY = 0;
    let count = 0;
    for (let i = nextStart; i < nextEnd; i++) {
      const y = ys[i] as number;
      if (!Number.isFinite(y)) continue;
      avgX += xs[i] as number;
      avgY += y;
      count++;
    }
    if (count === 0) {
      avgX = xs[n - 1] as number;
      avgY = Number.isFinite(ys[n - 1] as number) ? (ys[n - 1] as number) : (ys[a] as number);
    } else {
      avgX /= count;
      avgY /= count;
    }

    const ax = xs[a] as number;
    const ay = ys[a] as number;
    let best = -1;
    let bestArea = -1;
    for (let i = start; i < end; i++) {
      const y = ys[i] as number;
      if (!Number.isFinite(y)) continue;
      const area = Math.abs((ax - avgX) * (y - ay) - (ax - (xs[i] as number)) * (avgY - ay));
      if (area > bestArea) {
        bestArea = area;
        best = i;
      }
    }
    if (best !== -1) {
      out.push(best);
      a = best;
    }
  }
  out.push(n - 1);
  return out;
}

/**
 * LTTB over chart points. Returns `points` itself (same reference) when
 * `points.length <= threshold`. Gaps (`y: null`) are kept: each defined run
 * between gaps is downsampled with a share of the budget proportional to its
 * length, and one null point stays between runs so lines still break.
 */
export function largestTriangleThreeBuckets<P extends ChartPoint>(
  points: readonly P[],
  threshold: number
): readonly P[] {
  const n = points.length;
  if (n <= threshold) return points;

  const runs: [number, number][] = [];
  let runStart = -1;
  for (let i = 0; i < n; i++) {
    const defined = (points[i] as P).y !== null && Number.isFinite((points[i] as P).y);
    if (defined && runStart === -1) runStart = i;
    if (!defined && runStart !== -1) {
      runs.push([runStart, i]);
      runStart = -1;
    }
  }
  if (runStart !== -1) runs.push([runStart, n]);
  if (runs.length === 0) return [];

  const definedCount = runs.reduce((sum, [s, e]) => sum + e - s, 0);
  const budget = Math.max(runs.length * 2, Math.floor(threshold) - (runs.length - 1));
  const out: P[] = [];
  runs.forEach(([s, e], r) => {
    if (r > 0) {
      // Keep the first gap point after the previous run.
      const gapIndex = (runs[r - 1] as [number, number])[1];
      out.push(points[gapIndex] as P);
    }
    const length = e - s;
    const share = Math.max(2, Math.round((budget * length) / definedCount));
    const xs = new Float64Array(length);
    const ys = new Float64Array(length);
    for (let i = 0; i < length; i++) {
      xs[i] = (points[s + i] as P).x;
      ys[i] = (points[s + i] as P).y as number;
    }
    for (const i of lttbIndices(xs, ys, share)) out.push(points[s + i] as P);
  });
  return out;
}
