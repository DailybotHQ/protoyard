import { describe, expect, it } from 'vitest';
import { keepsZoom } from '../src/app/fit.ts';

describe('free-slide fit', () => {
  it('keeps a zoom that still fits on a resize, so a slide never flips between two fits', () => {
    // Regression (deck design gate, flagship `explore` slide on the @texuli/slides stage):
    // re-measuring with the zoom reset let the chart explorer reflow to the full width,
    // dropped the zoom, and put it back a frame later, every frame.
    const base = {
      applied: 0.75,
      reason: 'resize' as const,
      spaceChanged: false,
      fitsAtApplied: true,
      min: 0.72,
    };
    expect(keepsZoom(base)).toBe(true);
    // At the floor, overflowing content keeps the floor (Pixel 7 flipped 0.75 ↔ 0.79).
    expect(keepsZoom({ ...base, applied: 0.72, fitsAtApplied: false })).toBe(true);
    // Nothing applied yet, new content, a changed stage, or an overflow: measure again.
    for (const change of [
      { applied: 1 },
      { reason: 'content' as const },
      { spaceChanged: true },
      { fitsAtApplied: false },
    ]) {
      expect(keepsZoom({ ...base, ...change }), JSON.stringify(change)).toBe(false);
    }
  });
});
