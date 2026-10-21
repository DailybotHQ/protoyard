import { describe, expect, it } from 'vitest';
import { isoWeek, levelFor, streakWeeks } from '../src/index.ts';

describe('levels and streaks', () => {
  it('places 140 at level 3 with 85 remaining on the default thresholds', () => {
    expect(levelFor(140)).toEqual({ level: 3, floor: 100, next: 225, missing: 85 });
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(675).level).toBe(7);
    expect(levelFor(5000)).toMatchObject({ level: 12, next: null, missing: 0 });
  });

  it('honours a custom threshold list', () => {
    expect(levelFor(15, [0, 10, 20])).toEqual({
      level: 2,
      floor: 10,
      next: 20,
      missing: 5,
    });
  });

  it('counts consecutive ISO weeks ending this week or last week', () => {
    const now = new Date('2026-10-20T19:41:00.000Z');
    const dates = ['2026-10-20', '2026-10-14', '2026-10-08', '2026-10-01', '2026-09-20'].map(
      (day) => `${day}T15:00:00.000Z`
    );
    expect(isoWeek(now)).toBe('2026-W43');
    expect(streakWeeks(dates, now)).toBe(4);
    expect(streakWeeks(dates.slice(1), now)).toBe(3);
    expect(streakWeeks([], now)).toBe(0);
  });
});
