import { describe, expect, it } from 'vitest';
import { largestTriangleThreeBuckets, linearScale, ordinalScale, pack } from '../src/index.ts';
import { linearScale as fromScales } from '../src/scales/index.ts';

describe('@protoyard/charts math via @texuli/charts', () => {
  it('re-exports linearScale that maps a domain', () => {
    const scale = linearScale({ domain: [0, 10], range: [0, 100] });
    expect(scale(5)).toBe(50);
    expect(fromScales({ domain: [0, 1], range: [0, 10] })(0.5)).toBe(5);
  });

  it('exposes Texuli extras (ordinalScale, pack)', () => {
    const color = ordinalScale({
      domain: ['a', 'b'] as string[],
      range: ['#111', '#222'],
    });
    expect(color('a')).toBe('#111');
    expect(color('missing')).toBeUndefined();
    const circles = pack(
      {
        id: 'root',
        children: [
          { id: 'x', value: 2 },
          { id: 'y', value: 1 },
        ],
      },
      { width: 100, height: 100 }
    );
    expect(circles.length).toBeGreaterThan(0);
  });

  it('downsamples dense series with LTTB', () => {
    const points = Array.from({ length: 200 }, (_, i) => ({ x: i, y: Math.sin(i / 10) }));
    const out = largestTriangleThreeBuckets(points, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.length).toBeGreaterThan(2);
  });
});
