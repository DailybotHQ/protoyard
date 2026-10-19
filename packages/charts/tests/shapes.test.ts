import { describe, expect, it } from 'vitest';
import {
  arcCentroid,
  arcPath,
  areaPath,
  bin,
  groupOffsets,
  linePath,
  pie,
  roundCoord,
  SYMBOL_TYPES,
  stack,
  stackExtent,
  sturges,
  symbolPath,
} from '../src/shapes/index.ts';

const pts = [
  { x: 0, y: 10 },
  { x: 10, y: 0 },
  { x: 20, y: 5 },
  { x: 30, y: 5 },
];

/** End point of every command (M, L, C, A), skipping arc radii and control points. */
const coords = (d: string): (readonly [number, number])[] =>
  [...d.matchAll(/([MLCA])([^MLCAZ]*)/g)].map((m) => {
    const nums = (m[2] as string).split(',').map(Number);
    return [nums.at(-2) as number, nums.at(-1) as number] as const;
  });

describe('linePath', () => {
  it('draws linear and step curves', () => {
    expect(linePath(pts)).toBe('M0,10L10,0L20,5L30,5');
    expect(linePath(pts, { curve: 'step' })).toBe(
      'M0,10L5,10L5,0L10,0L15,0L15,5L20,5L25,5L25,5L30,5'
    );
    expect(linePath(pts, { curve: 'step-after' })).toBe('M0,10L10,10L10,0L20,0L20,5L30,5L30,5');
    expect(linePath(pts, { curve: 'step-before' })).toBe('M0,10L0,0L10,0L10,5L20,5L20,5L30,5');
  });

  it('draws a monotone curve that never overshoots its points', () => {
    const d = linePath(pts, { curve: 'monotone-x' });
    expect(d).toBe('M0,10C3.33,5,6.67,0,10,0C13.33,0,16.67,5,20,5C23.33,5,26.67,5,30,5');
    // Control points included: a monotone curve stays inside each segment's y range.
    const controlYs = d
      .split('C')
      .slice(1)
      .flatMap((c) =>
        c
          .split(',')
          .filter((_, i) => i % 2 === 1)
          .map(Number)
      );
    expect(controlYs).toHaveLength(9);
    for (const y of controlYs) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
    // Two points fall back to a straight cubic-free segment.
    expect(linePath(pts.slice(0, 2), { curve: 'monotone-x' })).toBe('M0,10L10,0');
  });

  it('breaks at gaps and honours `defined`', () => {
    const gappy = [
      { x: 0, y: 1 },
      { x: 1, y: null },
      { x: 2, y: 3 },
      { x: 3, y: Number.NaN },
      { x: 4, y: 5 },
      { x: 5, y: 6 },
    ];
    expect(linePath(gappy)).toBe('M0,1ZM2,3ZM4,5L5,6');
    expect(linePath(pts, { defined: (p) => p.y !== 0 })).toBe('M0,10ZM20,5L30,5');
    expect(linePath([])).toBe('');
    expect(linePath([{ x: 0, y: null }])).toBe('');
  });

  it('rounds coordinates to two decimals', () => {
    expect(
      linePath([
        { x: 0.123456, y: 1 / 3 },
        { x: 2, y: -0.0001 },
      ])
    ).toBe('M0.12,0.33L2,0');
    expect(roundCoord(1.005)).toBe(1);
  });
});

describe('areaPath', () => {
  it('closes each run along its baseline', () => {
    const area = [
      { x: 0, y0: 20, y1: 10 },
      { x: 10, y0: 20, y1: 0 },
      { x: 20, y0: 20, y1: null },
      { x: 30, y0: 20, y1: 5 },
      { x: 40, y0: 18, y1: 4 },
    ];
    expect(areaPath(area)).toBe('M0,10L10,0L10,20L0,20ZM30,5L40,4L40,18L30,20Z');
  });

  it('mirrors step curves on the baseline so stacked steps line up', () => {
    const area = [
      { x: 0, y0: 10, y1: 5 },
      { x: 10, y0: 8, y1: 2 },
    ];
    expect(areaPath(area, { curve: 'step-after' })).toBe('M0,5L10,5L10,2L10,8L10,10L0,10Z');
  });
});

describe('stack', () => {
  const series = [
    [10, 20, -5],
    [5, null, 10],
    [5, 10, -5],
  ];

  it('stacks cumulatively in series order', () => {
    expect(stack(series)).toEqual([
      [
        [0, 10],
        [0, 20],
        [0, -5],
      ],
      [
        [10, 15],
        [20, 20],
        [-5, 5],
      ],
      [
        [15, 20],
        [20, 30],
        [5, 0],
      ],
    ]);
  });

  it('expands to 100% using absolute values', () => {
    const out = stack(series, { offset: 'expand' });
    expect(out.map((s) => s[0])).toEqual([
      [0, 0.5],
      [0.5, 0.75],
      [0.75, 1],
    ]);
    expect(out[2]?.[2]?.[1]).toBeCloseTo(1, 10);
    expect(stack([[0], [0]], { offset: 'expand' })).toEqual([[[0, 0]], [[0, 0]]]);
  });

  it('diverges negatives below zero without overlap', () => {
    const out = stack(series, { offset: 'diverging' });
    expect(out.map((s) => s[2])).toEqual([
      [-5, 0],
      [0, 10],
      [-10, -5],
    ]);
    expect(stackExtent(out)).toEqual([-10, 30]);
  });

  it('groups bars inside a band', () => {
    const g = groupOffsets(100, 3, 0.25);
    expect(g.width).toBeCloseTo((100 / 2.75) * 0.75, 10);
    expect((g.offsets.at(-1) as number) + g.width).toBeCloseTo(100, 10);
    expect(g.offsets[0]).toBe(0);
    expect(groupOffsets(40, 1).width).toBeCloseTo(40, 10);
    expect(groupOffsets(40, 0)).toEqual({ offsets: [], width: 0 });
  });
});

describe('pie and arcs', () => {
  it('splits the circle proportionally in input order, sorting only the placement', () => {
    const slices = pie([1, 3, 0, null, -2]);
    expect(slices.map((s) => s.value)).toEqual([1, 3, 0, 0, 0]);
    expect(slices[0]?.startAngle).toBe(0);
    expect(slices[0]?.endAngle).toBeCloseTo(Math.PI / 2, 10);
    expect(slices[1]?.endAngle).toBeCloseTo(Math.PI * 2, 10);
    const sorted = pie([1, 3], { sort: 'desc' });
    expect(sorted[1]?.startAngle).toBe(0);
    expect(sorted[0]?.startAngle).toBeCloseTo(1.5 * Math.PI, 10);
    expect(pie([2, 2], { padAngle: 0.1 }).every((s) => s.padAngle === 0.1)).toBe(true);
    expect(pie([5], { padAngle: 0.1 })[0]?.padAngle).toBe(0);
  });

  it('draws pie slices, donut slices and full rings', () => {
    expect(arcPath({ innerRadius: 0, outerRadius: 10, startAngle: 0, endAngle: Math.PI / 2 })).toBe(
      'M0,-10A10,10,0,0,1,10,0L0,0Z'
    );
    expect(arcPath({ innerRadius: 5, outerRadius: 10, startAngle: 0, endAngle: Math.PI })).toBe(
      'M0,-10A10,10,0,0,1,0,10L0,5A5,5,0,0,0,0,-5Z'
    );
    expect(
      arcPath({ innerRadius: 0, outerRadius: 10, startAngle: 0, endAngle: 1.5 * Math.PI })
    ).toContain('A10,10,0,1,1');
    expect(arcPath({ innerRadius: 4, outerRadius: 8, startAngle: 0, endAngle: Math.PI * 2 })).toBe(
      'M0,-8A8,8,0,1,1,0,8A8,8,0,1,1,0,-8ZM0,-4A4,4,0,1,0,0,4A4,4,0,1,0,0,-4Z'
    );
    expect(arcPath({ innerRadius: 0, outerRadius: 10, startAngle: 1, endAngle: 1 })).toBe('');
  });

  it('rounds corners with arcs tangent to the rim, keeping every point inside the ring', () => {
    const d = arcPath({
      innerRadius: 20,
      outerRadius: 40,
      startAngle: 0,
      endAngle: Math.PI / 2,
      cornerRadius: 4,
    });
    expect(d.match(/A4,4/g)).toHaveLength(4);
    for (const [x, y] of coords(d)) {
      const r = Math.hypot(x, y);
      if (r > 1) {
        expect(r).toBeGreaterThanOrEqual(20 - 0.02);
        expect(r).toBeLessThanOrEqual(40 + 0.02);
      }
    }
    // A thin slice clamps the corner radius instead of folding over.
    const thin = arcPath({
      innerRadius: 0,
      outerRadius: 40,
      startAngle: 0,
      endAngle: 0.05,
      cornerRadius: 30,
    });
    const radius = Number(/A(\d+(?:\.\d+)?),/.exec(thin)?.[1]);
    expect(radius).toBeLessThan(1.1);
  });

  it('trims pad angles and finds label centroids', () => {
    const padded = arcPath({
      innerRadius: 0,
      outerRadius: 10,
      startAngle: 0,
      endAngle: Math.PI / 2,
      padAngle: 0.2,
    });
    const [start] = coords(padded);
    expect(start?.[0]).toBeCloseTo(roundCoord(10 * Math.sin(0.1)), 2);
    expect(
      arcCentroid({ innerRadius: 0, outerRadius: 10, startAngle: 0, endAngle: Math.PI })
    ).toEqual([5, 0]);
  });
});

describe('symbols', () => {
  it('draws every symbol centred on its point', () => {
    for (const type of SYMBOL_TYPES) {
      const d = symbolPath(type, 50, 50, 100);
      const xs = coords(d).map(([x]) => x);
      const ys = coords(d).map(([, y]) => y);
      expect((Math.min(...xs) + Math.max(...xs)) / 2, type).toBeCloseTo(50, 0);
      if (type !== 'triangle')
        expect((Math.min(...ys) + Math.max(...ys)) / 2, type).toBeCloseTo(50, 0);
    }
    expect(symbolPath('square', 0, 0, 16)).toBe('M-2,-2L2,-2L2,2L-2,2Z');
  });
});

describe('bin', () => {
  it('uses Sturges with nice edges and counts every value once', () => {
    const values = [1, 2, 2, 3, 3, 3, 4, 4, 9.5, 10, null, Number.NaN];
    const bins = bin(values);
    expect(sturges(10)).toBe(5);
    expect(bins.map((b) => [b.x0, b.x1])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 8],
      [8, 10],
    ]);
    expect(bins.map((b) => b.count)).toEqual([1, 5, 2, 0, 2]);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(10);
  });

  it('accepts explicit thresholds, counts and domains', () => {
    expect(bin([1, 5, 9], { thresholds: [4, 8] }).map((b) => [b.x0, b.x1, b.count])).toEqual([
      [1, 4, 1],
      [4, 8, 1],
      [8, 9, 1],
    ]);
    expect(bin([0.1, 0.25, 0.9], { count: 2 }).map((b) => b.x1)).toEqual([0.5, 1]);
    expect(bin([5, 50], { domain: [0, 10], count: 2 }).map((b) => b.count)).toEqual([0, 1]);
    expect(bin([3, 3, 3]).map((b) => [b.x0, b.x1, b.count])).toEqual([[3, 3, 3]]);
    expect(bin([])).toEqual([]);
  });
});
