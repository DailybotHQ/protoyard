import { describe, expect, it } from 'vitest';
import { CANVAS_POINT_THRESHOLD, useCanvas } from '../src/canvas/index.ts';

describe('canvas re-exports from @texuli/charts', () => {
  it('exposes canvas helpers', () => {
    expect(CANVAS_POINT_THRESHOLD).toBeGreaterThan(0);
    expect(typeof useCanvas).toBe('function');
  });
});
