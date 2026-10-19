import { describe, expect, it } from 'vitest';
import {
  bandScale,
  chooseTimeInterval,
  floorTime,
  formatCents,
  formatCompact,
  formatDate,
  formatNumber,
  formatPercent,
  formatTick,
  formatTimeTick,
  linearScale,
  logScale,
  niceDomain,
  pointScale,
  sqrtScale,
  stepPrecision,
  tickStep,
  ticks,
  timeScale,
  timeTicks,
} from '../src/scales/index.ts';

const utc = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

describe('linear ticks', () => {
  it('uses 1/2/5 steps for known domains', () => {
    expect(ticks(0, 10, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ticks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(ticks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(tickStep(0, 1000, 4)).toBe(200);
  });

  it('handles negative, reversed, empty and one-point domains', () => {
    expect(ticks(-10, 10, 4)).toEqual([-10, -5, 0, 5, 10]);
    expect(ticks(10, 0, 2)).toEqual([10, 5, 0]);
    expect(ticks(5, 5, 10)).toEqual([5]);
    expect(ticks(Number.NaN, 1)).toEqual([]);
  });

  it('nices domains outward', () => {
    expect(niceDomain(0.13, 9.7, 10)).toEqual([0, 10]);
    expect(niceDomain(-3.2, 47, 5)).toEqual([-10, 50]);
    expect(niceDomain(97, 3, 10)).toEqual([100, 0]);
    expect(stepPrecision(0.25)).toBe(1);
    expect(stepPrecision(0.05)).toBe(2);
    expect(stepPrecision(20)).toBe(0);
  });
});

describe('linearScale', () => {
  it('maps, inverts and ticks', () => {
    const y = linearScale({ domain: [0, 200], range: [300, 0] });
    expect(y(0)).toBe(300);
    expect(y(50)).toBe(225);
    expect(y.invert(225)).toBe(50);
    for (const v of [0, 13, 77.5, 200]) expect(y.invert(y(v))).toBeCloseTo(v, 10);
    expect(y.ticks(4)).toEqual([0, 50, 100, 150, 200]);
  });

  it('nices and clamps', () => {
    const x = linearScale({ domain: [3, 97], range: [0, 100], nice: true, clamp: true });
    expect(x.domain).toEqual([0, 100]);
    expect(x(150)).toBe(100);
    expect(x.invert(-20)).toBe(0);
  });

  it('puts a one-value domain mid-range instead of dividing by zero', () => {
    const x = linearScale({ domain: [4, 4], range: [0, 100] });
    expect(x(4)).toBe(50);
    expect(x(9)).toBe(50);
    expect(x.invert(10)).toBe(4);
    expect(x.ticks()).toEqual([4]);
  });
});

describe('sqrtScale and logScale', () => {
  it('sqrt maps areas, mirrors negatives and inverts', () => {
    const r = sqrtScale({ domain: [0, 100], range: [0, 20] });
    expect(r(25)).toBe(10);
    expect(r.invert(10)).toBeCloseTo(25, 10);
    const s = sqrtScale({ domain: [-100, 100], range: [-10, 10] });
    expect(s(-25)).toBeCloseTo(-5, 10);
  });

  it('log maps decades evenly and ticks powers and multiples', () => {
    const x = logScale({ domain: [1, 1000], range: [0, 300] });
    expect(x(10)).toBeCloseTo(100, 10);
    expect(x.invert(200)).toBeCloseTo(100, 8);
    expect(x.ticks(10).slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(x.ticks(10)).toContain(1000);
    const wide = logScale({ domain: [1, 1e9], range: [0, 900] });
    expect(wide.ticks(5)).toEqual([1, 100, 10_000, 1_000_000, 100_000_000]);
  });

  it('log nices to powers, supports negative domains and rejects zero', () => {
    expect(logScale({ domain: [3, 870], range: [0, 1], nice: true }).domain).toEqual([1, 1000]);
    const neg = logScale({ domain: [-1000, -1], range: [0, 300] });
    expect(neg(-10)).toBeCloseTo(200, 10);
    expect(neg.ticks(10)[0]).toBe(-1000);
    expect(neg.ticks(10).at(-1)).toBe(-1);
    expect(() => logScale({ domain: [0, 10], range: [0, 1] })).toThrow(RangeError);
    expect(() => logScale({ domain: [-1, 10], range: [0, 1] })).toThrow(RangeError);
  });
});

describe('time scales (UTC)', () => {
  it('chooses intervals by span', () => {
    expect(chooseTimeInterval(utc('2026-03-01T00:00:00Z'), utc('2026-03-01T01:00:00Z'), 6)).toEqual(
      {
        unit: 'minute',
        step: 15,
      }
    );
    expect(chooseTimeInterval(utc('2026-03-01T00:00:00Z'), utc('2026-03-08T00:00:00Z'), 7)).toEqual(
      {
        unit: 'day',
        step: 1,
      }
    );
    expect(
      chooseTimeInterval(utc('2026-01-01T00:00:00Z'), utc('2027-01-01T00:00:00Z'), 12)
    ).toEqual({
      unit: 'month',
      step: 1,
    });
    expect(chooseTimeInterval(utc('2026-01-01T00:00:00Z'), utc('2028-01-01T00:00:00Z'), 8)).toEqual(
      {
        unit: 'month',
        step: 3,
      }
    );
    expect(
      chooseTimeInterval(utc('2000-01-01T00:00:00Z'), utc('2026-01-01T00:00:00Z'), 6).unit
    ).toBe('year');
  });

  it('month ticks land on the first of each month across DST changes', () => {
    // US and EU DST switches fall in March and late October/November.
    const values = timeTicks(utc('2026-02-15T12:00:00Z'), utc('2026-11-20T00:00:00Z'), {
      unit: 'month',
      step: 1,
    });
    expect(values.map(iso)).toEqual([
      '2026-03-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
    ]);
  });

  it('aligns quarters, weeks (Monday by default) and hour steps', () => {
    expect(
      timeTicks(utc('2026-01-10T00:00:00Z'), utc('2026-12-31T00:00:00Z'), {
        unit: 'month',
        step: 3,
      }).map(iso)
    ).toEqual(['2026-04-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z']);
    // 2026-03-04 is a Wednesday.
    expect(iso(floorTime(utc('2026-03-04T10:00:00Z'), { unit: 'week', step: 1 }))).toBe(
      '2026-03-02T00:00:00.000Z'
    );
    expect(
      iso(floorTime(utc('2026-03-04T10:00:00Z'), { unit: 'week', step: 1 }, { weekStartsOn: 0 }))
    ).toBe('2026-03-01T00:00:00.000Z');
    expect(
      timeTicks(utc('2026-03-02T01:00:00Z'), utc('2026-03-02T13:00:00Z'), {
        unit: 'hour',
        step: 6,
      }).map(iso)
    ).toEqual(['2026-03-02T06:00:00.000Z', '2026-03-02T12:00:00.000Z']);
  });

  it('timeScale maps, inverts, nices and reports its tick interval', () => {
    const start = utc('2026-03-01T00:00:00Z');
    const end = utc('2026-03-31T00:00:00Z');
    const x = timeScale({ domain: [start, end], range: [0, 300] });
    expect(x(start)).toBe(0);
    expect(x(end)).toBe(300);
    const mid = utc('2026-03-16T00:00:00Z');
    expect(x.invert(x(mid))).toBeCloseTo(mid, 0);
    expect(x.tickInterval(5)).toEqual({ unit: 'week', step: 1 });
    expect(x.ticks(5).map(iso)[0]).toBe('2026-03-02T00:00:00.000Z');

    const nice = timeScale({
      domain: [utc('2026-03-01T03:20:00Z'), utc('2026-03-01T21:40:00Z')],
      range: [0, 100],
      nice: true,
    });
    expect(nice.domain.map(iso)).toEqual(['2026-03-01T03:00:00.000Z', '2026-03-02T00:00:00.000Z']);
  });

  it('a one-instant domain yields that instant as its only tick when aligned', () => {
    const t = utc('2026-03-02T00:00:00Z');
    expect(timeTicks(t, t, { unit: 'day', step: 1 })).toEqual([t]);
  });
});

describe('band and point scales', () => {
  it('lays out bands with padding and inverts positions to keys', () => {
    const x = bandScale({
      domain: ['a', 'b', 'c', 'd'],
      range: [0, 100],
      paddingInner: 0.2,
      paddingOuter: 0.1,
    });
    const step = 100 / (4 - 0.2 + 0.2);
    expect(x.step()).toBeCloseTo(step, 10);
    expect(x.bandwidth()).toBeCloseTo(step * 0.8, 10);
    expect(x('a')).toBeCloseTo(step * 0.1, 10);
    expect(x('d')).toBeCloseTo(step * 0.1 + step * 3, 10);
    expect(x('zzz' as 'a')).toBeUndefined();
    expect(x.invert((x('c') as number) + 1)).toBe('c');
    expect(x.invert(-50)).toBeUndefined();
  });

  it('supports reversed ranges, duplicates and empty domains', () => {
    const x = bandScale({ domain: ['a', 'b', 'a'], range: [100, 0] });
    expect(x.domain).toEqual(['a', 'b']);
    expect(x('a')).toBe(50);
    expect(x('b')).toBe(0);
    expect(x.invert(75)).toBe('a');
    expect(x.invert(25)).toBe('b');
    const empty = bandScale({ domain: [], range: [0, 100] });
    expect(empty.bandwidth()).toBe(0);
    expect(empty.invert(10)).toBeUndefined();
  });

  it('point scales space keys evenly with zero bandwidth', () => {
    const p = pointScale({ domain: ['mon', 'tue', 'wed'], range: [0, 200] });
    expect([p('mon'), p('tue'), p('wed')]).toEqual([0, 100, 200]);
    expect(p.bandwidth()).toBe(0);
    expect(p.invert(140)).toBe('tue');
    const padded = pointScale({ domain: ['a', 'b'], range: [0, 300], padding: 1 });
    expect([padded('a'), padded('b')]).toEqual([100, 200]);
  });
});

describe('formatters', () => {
  it('formats numbers, compact numbers and ticks', () => {
    expect(formatNumber(1234.567)).toBe('1,234.57');
    expect(formatNumber(12, { signed: true })).toBe('+12');
    expect(formatCompact(1234)).toBe('1.2K');
    expect(formatCompact(3_400_000)).toBe('3.4M');
    expect(formatTick(0.5, 0.25)).toBe('0.5');
    expect(formatTick(2, 0.5)).toBe('2.0');
    expect(formatTick(1500, 500)).toBe('1,500');
  });

  it('formats integer cents and rejects fractional cents', () => {
    expect(formatCents(123_456)).toBe('$1,234.56');
    expect(formatCents(-500, 'USD', { signed: true })).toBe('-$5.00');
    expect(formatCents(1200, 'USD', { trimZeroCents: true })).toBe('$12');
    expect(formatCents(1_234_500, 'USD', { compact: true })).toBe('$12.3K');
    expect(formatCents(99_00, 'EUR', { locale: 'de-DE' })).toBe('99,00\u00a0€');
    expect(() => formatCents(12.5)).toThrow(RangeError);
  });

  it('formats percentages', () => {
    expect(formatPercent(0.125)).toBe('12.5%');
    expect(formatPercent(0.04, { signed: true, digits: 0 })).toBe('+4%');
  });

  it('formats UTC time ticks by interval, independent of the host zone', () => {
    const t = utc('2026-03-02T09:15:30Z');
    expect(formatTimeTick(t, { unit: 'year', step: 1 })).toBe('2026');
    expect(formatTimeTick(t, { unit: 'month', step: 1 })).toBe('Mar 2026');
    expect(formatTimeTick(utc('2026-07-01T00:00:00Z'), { unit: 'month', step: 3 })).toBe('Q3 2026');
    expect(formatTimeTick(t, { unit: 'day', step: 1 })).toBe('Mar 2');
    expect(formatTimeTick(t, { unit: 'hour', step: 1 })).toBe('09:15');
    expect(formatTimeTick(t, { unit: 'second', step: 15 })).toBe('09:15:30');
    expect(formatDate(t)).toBe('Mar 2, 2026');
    expect(formatDate(t, { withTime: true })).toBe('Mar 2, 2026, 09:15');
  });
});
