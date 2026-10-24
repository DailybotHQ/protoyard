import { describe, expect, it } from 'vitest';
import { CHART_FAMILIES } from '../src/index.ts';

describe('charts-ui root', () => {
  it('lists every family including flow and interaction', () => {
    expect(CHART_FAMILIES).toEqual(
      expect.arrayContaining([
        'cartesian',
        'part-whole',
        'matrix',
        'compact',
        'canvas',
        'geo',
        'flow',
        'interaction',
      ])
    );
  });
});
