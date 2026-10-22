import { describe, expect, it } from 'vitest';
import { nextMonotonicIso } from '../src/time.ts';

const FROZEN = '2026-03-15T10:00:00.000Z';
const FROZEN_MS = Date.parse(FROZEN);

describe('nextMonotonicIso', () => {
  it('returns now when there is no previous instant', () => {
    expect(nextMonotonicIso(null, FROZEN)).toBe(FROZEN);
    expect(nextMonotonicIso(undefined, FROZEN_MS)).toBe(FROZEN);
    expect(nextMonotonicIso('', new Date(FROZEN))).toBe(FROZEN);
  });

  it('advances by 1 ms when now equals the previous instant (paused clock)', () => {
    const first = nextMonotonicIso(null, FROZEN);
    const second = nextMonotonicIso(first, FROZEN);
    const third = nextMonotonicIso(second, FROZEN);
    expect(first).toBe(FROZEN);
    expect(Date.parse(second)).toBe(FROZEN_MS + 1);
    expect(Date.parse(third)).toBe(FROZEN_MS + 2);
    expect([first, second, third].sort()).toEqual([first, second, third]);
  });

  it('keeps now when it is already after the previous instant', () => {
    const later = '2026-03-15T10:00:05.000Z';
    expect(nextMonotonicIso(FROZEN, later)).toBe(later);
    expect(nextMonotonicIso(FROZEN, Date.parse(later))).toBe(later);
  });

  it('accepts Date, ISO string and epoch ms for now', () => {
    const last = FROZEN;
    expect(nextMonotonicIso(last, new Date(FROZEN))).toBe('2026-03-15T10:00:00.001Z');
    expect(nextMonotonicIso(last, FROZEN)).toBe('2026-03-15T10:00:00.001Z');
    expect(nextMonotonicIso(last, FROZEN_MS)).toBe('2026-03-15T10:00:00.001Z');
  });

  it('preserves insertion order across a paused burst', () => {
    let last: string | null = null;
    const times: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const at = nextMonotonicIso(last, FROZEN);
      times.push(at);
      last = at;
    }
    expect(times).toEqual([...times].sort());
    expect(new Set(times).size).toBe(20);
  });

  it('rejects invalid now or lastIso', () => {
    expect(() => nextMonotonicIso(null, 'not-a-date')).toThrow(/Invalid now/);
    expect(() => nextMonotonicIso('not-a-date', FROZEN)).toThrow(/Invalid lastIso/);
    expect(() => nextMonotonicIso(null, Number.NaN)).toThrow(/Invalid now/);
  });
});
