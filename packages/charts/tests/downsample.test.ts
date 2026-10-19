import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  bisectLeft,
  bisectX,
  downsampleThreshold,
  largestTriangleThreeBuckets,
  lttbIndices,
  minMaxBuckets,
} from '../src/downsample/index.ts';
import type { ChartPoint } from '../src/types.ts';

/** A noisy daily-like series with one spike up and one outage dip, from a fixed seed. */
function spikeSeries(
  n: number,
  seed = 'charts-downsample'
): { xs: Float64Array; ys: Float64Array } {
  const rng = createRng(seed);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = i * 60_000;
    ys[i] = 100 + Math.sin(i / 50) * 20 + rng.float(-5, 5);
  }
  ys[Math.floor(n * 0.3)] = 1000;
  ys[Math.floor(n * 0.7)] = -500;
  return { xs, ys };
}

const toPoints = (xs: ArrayLike<number>, ys: ArrayLike<number>): ChartPoint[] =>
  Array.from({ length: xs.length }, (_, i) => ({ x: xs[i] as number, y: ys[i] as number }));

describe('lttbIndices', () => {
  it('keeps first and last, returns the requested count, ascending', () => {
    const { xs, ys } = spikeSeries(10_000);
    const kept = lttbIndices(xs, ys, 1000);
    expect(kept).toHaveLength(1000);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(9999);
    for (let i = 1; i < kept.length; i++) expect(kept[i]).toBeGreaterThan(kept[i - 1] as number);
  });

  it('preserves the extremes of a spike series', () => {
    const { xs, ys } = spikeSeries(10_000);
    const kept = lttbIndices(xs, ys, 500);
    expect(kept).toContain(3000);
    expect(kept).toContain(7000);
  });

  it('is deterministic and accepts plain or typed arrays alike', () => {
    const { xs, ys } = spikeSeries(5000);
    const typed = lttbIndices(xs, ys, 300);
    expect(lttbIndices(xs, ys, 300)).toEqual(typed);
    expect(lttbIndices(Array.from(xs), Array.from(ys), 300)).toEqual(typed);
    expect(lttbIndices(new Float32Array(xs), new Float32Array(ys), 300)).toHaveLength(300);
  });

  it('returns every index when n <= threshold and handles tiny thresholds', () => {
    expect(lttbIndices([1, 2, 3], [4, 5, 6], 10)).toEqual([0, 1, 2]);
    const { xs, ys } = spikeSeries(100);
    expect(lttbIndices(xs, ys, 2)).toEqual([0, 99]);
    expect(lttbIndices(xs, ys, 1)).toEqual([0]);
    expect(lttbIndices(xs, ys, 0)).toEqual([]);
    expect(lttbIndices([], [], 10)).toEqual([]);
  });
});

describe('largestTriangleThreeBuckets', () => {
  it('returns the same array reference when nothing needs dropping', () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    expect(largestTriangleThreeBuckets(points, 10)).toBe(points);
  });

  it('downsamples points, keeping the original objects and the spike', () => {
    const { xs, ys } = spikeSeries(10_000);
    const points = toPoints(xs, ys).map((p, i) => ({ ...p, id: `p${i}` }));
    const out = largestTriangleThreeBuckets(points, 800);
    expect(out.length).toBeLessThanOrEqual(800);
    expect(out.length).toBeGreaterThan(700);
    expect(out[0]).toBe(points[0]);
    expect(out.at(-1)).toBe(points.at(-1));
    expect(out.map((p) => p.id)).toContain('p3000');
  });

  it('keeps gaps so lines still break', () => {
    const { xs, ys } = spikeSeries(3000);
    const points: ChartPoint[] = toPoints(xs, ys);
    for (let i = 1000; i < 1100; i++) points[i] = { x: xs[i] as number, y: null };
    const out = largestTriangleThreeBuckets(points, 300);
    const nulls = out.filter((p) => p.y === null);
    expect(nulls).toHaveLength(1);
    expect(nulls[0]?.x).toBe(xs[1000]);
    expect(out[0]).toBe(points[0]);
    expect(out.at(-1)).toBe(points.at(-1));
    expect(out.length).toBeLessThanOrEqual(302);
    expect(
      largestTriangleThreeBuckets(
        [
          { x: 0, y: null },
          { x: 1, y: null },
        ],
        1
      )
    ).toEqual([]);
  });
});

describe('minMaxBuckets', () => {
  it('keeps first, min, max and last per column, preserving spikes and dips', () => {
    const { xs, ys } = spikeSeries(100_000);
    const kept = minMaxBuckets(xs, ys, { buckets: 800 });
    expect(kept.length).toBeLessThanOrEqual(800 * 4);
    expect(kept).toContain(30_000);
    expect(kept).toContain(70_000);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(99_999);
    for (let i = 1; i < kept.length; i++) expect(kept[i]).toBeGreaterThan(kept[i - 1] as number);
  });

  it('drops samples outside the visible range and keeps one gap marker per column', () => {
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const ys = [1, 9, Number.NaN, Number.NaN, 2, 8, 3, 7, 4, 6];
    expect(minMaxBuckets(xs, ys, { buckets: 1, x0: 2, x1: 5 })).toEqual([2, 4, 5]);
    expect(minMaxBuckets(xs, ys, { buckets: 100 })).toHaveLength(10);
    expect(minMaxBuckets([], [], { buckets: 10 })).toEqual([]);
  });
});

describe('bisect', () => {
  const xs = [0, 10, 20, 30];

  it('finds insertion points and nearest samples', () => {
    expect(bisectLeft(xs, 15)).toBe(2);
    expect(bisectLeft(xs, 20)).toBe(2);
    expect(bisectLeft(xs, 99)).toBe(4);
    expect(bisectX(xs, 14)).toBe(1);
    expect(bisectX(xs, 16)).toBe(2);
    expect(bisectX(xs, 15)).toBe(1);
    expect(bisectX(xs, -5)).toBe(0);
    expect(bisectX(xs, 500)).toBe(3);
    expect(bisectX([], 1)).toBe(-1);
  });

  it('works on points and typed arrays', () => {
    const points = xs.map((x) => ({ x, y: x }));
    expect(bisectX(points, 26)).toBe(3);
    expect(bisectX(new Float64Array(xs), 26)).toBe(3);
  });
});

describe('threshold', () => {
  it('derives the point budget from the plot width', () => {
    expect(downsampleThreshold(640)).toBe(1280);
  });
});

/** Opt-in: `PROTOYARD_BENCH=1 pnpm vitest run packages/charts/tests/downsample.test.ts`. */
describe.skipIf(!process.env.PROTOYARD_BENCH)('downsampling benchmark (Node)', () => {
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;
  const time = (fn: () => void, runs = 9) =>
    median(
      Array.from({ length: runs }, () => {
        const start = performance.now();
        fn();
        return performance.now() - start;
      })
    );

  it('meets the LTTB, min-max and bisect targets', () => {
    const small = spikeSeries(10_000);
    const large = spikeSeries(100_000);
    const lttb10k = time(() => lttbIndices(small.xs, small.ys, 1000));
    const lttb100k = time(() => lttbIndices(large.xs, large.ys, 2000));
    const m4 = time(() => minMaxBuckets(large.xs, large.ys, { buckets: 1600 }));
    const points = toPoints(large.xs, large.ys);
    const lookups = time(() => {
      for (let i = 0; i < 10_000; i++) bisectX(points, i * 600);
    });
    console.log(
      `BENCH lttb10k→1k=${lttb10k.toFixed(2)}ms lttb100k→2k=${lttb100k.toFixed(2)}ms minMax100k→1600=${m4.toFixed(2)}ms bisect10kLookups@100k=${lookups.toFixed(2)}ms`
    );
    expect(lttb10k).toBeLessThan(2);
    expect(lttb100k).toBeLessThan(15);
  });
});
