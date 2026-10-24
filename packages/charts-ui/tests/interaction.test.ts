import { describe, expect, it } from 'vitest';
import { seriesColor, toggleSeries } from '../src/interaction/index.ts';

describe('interaction re-exports from @texuli/charts', () => {
  it('exposes seriesColor and toggleSeries', () => {
    expect(seriesColor(0)).toMatch(/chart|var\(/);
    const ids = ['a', 'b'];
    expect([...toggleSeries(new Set(['a']), 'a', ids)]).toEqual([]);
    expect([...toggleSeries(new Set(), 'a', ids)]).toEqual(['a']);
  });
});
