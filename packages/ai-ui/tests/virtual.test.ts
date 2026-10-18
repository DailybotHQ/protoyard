import { describe, expect, it } from 'vitest';
import {
  calculateVirtualWindow,
  captureScrollAnchor,
  restoreScrollAnchor,
} from '../src/virtual.ts';

describe('virtual conversation window', () => {
  it('keeps the rendered range bounded for a 5,000-message thread', () => {
    const window = calculateVirtualWindow(5000, 120_000, 600, [], 120, 4);

    expect(window.totalSize).toBe(600_000);
    expect(window.items.length).toBeLessThanOrEqual(14);
    expect(window.items[0]?.index).toBe(996);
    expect(window.items.at(-1)?.index).toBe(1009);
  });

  it('uses measured variable heights to calculate offsets', () => {
    const window = calculateVirtualWindow(4, 65, 30, [20, 40, 30, 50], 100, 0);

    expect(window.items.map(({ index }) => index)).toEqual([2, 3]);
    expect(window.items.map(({ start, size }) => [start, size])).toEqual([
      [60, 30],
      [90, 50],
    ]);
    expect(window.totalSize).toBe(140);
  });

  it('preserves the visible message and its offset when earlier rows resize', () => {
    const ids = ['one', 'two', 'three'];
    const anchor = captureScrollAnchor(ids, 145, [40, 50, 60]);

    expect(anchor).toEqual({ messageId: 'three', offset: 55 });
    expect(restoreScrollAnchor(ids, anchor, [75, 80, 60])).toBe(210);
  });

  it('returns a safe top position when the saved message no longer exists', () => {
    expect(restoreScrollAnchor(['replacement'], { messageId: 'removed', offset: 20 })).toBe(0);
  });
});
