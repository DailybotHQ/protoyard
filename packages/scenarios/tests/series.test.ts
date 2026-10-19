import { MS_PER_DAY, parseScenario, type Scenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  bucketStart,
  createGenerateContext,
  eventStream,
  poisson,
  presetScenario,
  scenarioSeriesOptions,
  seriesRng,
  timeSeries,
} from '../src/index.ts';

const REF = '2026-06-03T15:00:00.000Z'; // a Wednesday
const scenario = (overrides: Record<string, unknown> = {}): Scenario =>
  parseScenario({ id: 'demo', name: 'Demo', seed: 42, referenceTime: REF, ...overrides });
const ctx = { scenario: scenario() };

describe('bucketStart', () => {
  it('aligns days, ISO weeks (Monday) and months in UTC', () => {
    const ms = Date.parse(REF);
    expect(new Date(bucketStart(ms, 'day')).toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(new Date(bucketStart(ms, 'week')).toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(new Date(bucketStart(ms, 'month')).toISOString()).toBe('2026-06-01T00:00:00.000Z');
    const sunday = Date.parse('2026-06-07T23:00:00.000Z');
    expect(new Date(bucketStart(sunday, 'week')).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('timeSeries', () => {
  const base = { ctx, key: 'signups', base: 100, trend: 'growth', seasonality: 'weekly' } as const;

  it('is deterministic per seed and differs across seeds and keys', () => {
    const a = timeSeries({ ...base, days: 30 });
    expect(timeSeries({ ...base, days: 30 })).toEqual(a);
    expect(timeSeries({ ...base, days: 30, ctx: { scenario: scenario({ seed: 7 }) } })).not.toEqual(
      a
    );
    expect(timeSeries({ ...base, days: 30, key: 'orders' })).not.toEqual(a);
  });

  it('is day-stable: more history adds older points without changing the rest', () => {
    const short = timeSeries({ ...base, days: 30 });
    const long = timeSeries({ ...base, days: 120 });
    expect(long).toHaveLength(120);
    expect(long.slice(-30)).toEqual(short);
    expect(long.at(-1)?.at).toBe('2026-06-03T00:00:00.000Z');
    expect(short[0]?.at).toBe('2026-05-05T00:00:00.000Z');
  });

  it('is stable for weeks and months too, ending at the bucket of `to`', () => {
    const weeks = timeSeries({ ...base, weeks: 12 });
    expect(timeSeries({ ...base, weeks: 30 }).slice(-12)).toEqual(weeks);
    expect(weeks.at(-1)?.at).toBe('2026-06-01T00:00:00.000Z');
    const months = timeSeries({ ...base, months: 14 });
    expect(months.map((p) => p.at.slice(0, 7))).toEqual([
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('draws each bucket from seriesRng(ctx, key, at)', () => {
    const points = timeSeries({ ctx, key: 'n', base: 1000, noise: 0.5, integer: false, days: 5 });
    for (const point of points) {
      const r = seriesRng(ctx, 'n', point.at).next();
      expect(point.value).toBeCloseTo(1000 * (1 + 0.5 * (2 * r - 1)), 9);
    }
  });

  it('respects bounds and integer rounding', () => {
    const points = timeSeries({ ...base, days: 365, noise: 1, min: 20, max: 110 });
    for (const point of points) {
      expect(point.value).toBeGreaterThanOrEqual(20);
      expect(point.value).toBeLessThanOrEqual(110);
      expect(Number.isInteger(point.value)).toBe(true);
    }
    const floats = timeSeries({ ...base, days: 10, integer: false });
    expect(floats.some((p) => !Number.isInteger(p.value))).toBe(true);
  });

  it('follows the trend: growth rises, decline falls, flat stays near base', () => {
    const level = (trend: 'growth' | 'decline' | 'flat') => {
      const points = timeSeries({ ctx, key: 't', base: 1000, trend, noise: 0, months: 12 });
      return [points[0]?.value ?? 0, points.at(-1)?.value ?? 0] as const;
    };
    const [growthStart, growthEnd] = level('growth');
    expect(growthEnd).toBe(1000);
    expect(growthStart).toBeLessThan(500);
    const [declineStart] = level('decline');
    expect(declineStart).toBeGreaterThan(1000);
    expect(level('flat')).toEqual([1000, 1000]);
  });

  it('weekly seasonality makes weekends quieter than mid-week', () => {
    const points = timeSeries({
      ctx,
      key: 'w',
      base: 1000,
      noise: 0,
      seasonality: 'weekly',
      days: 7,
    });
    const byWeekday = new Map(points.map((p) => [new Date(p.at).getUTCDay(), p.value]));
    expect(byWeekday.get(0)).toBeLessThan(byWeekday.get(3) ?? 0);
    expect(byWeekday.get(6)).toBeLessThan(byWeekday.get(2) ?? 0);
  });

  it('spikes lift the spike day and decay afterwards', () => {
    const at = new Date(Date.parse(REF) - 5 * MS_PER_DAY);
    const points = timeSeries({
      ctx,
      key: 's',
      base: 100,
      noise: 0,
      days: 10,
      spikes: [{ at, factor: 5, decayDays: 2 }],
    });
    const values = points.map((p) => p.value);
    expect(values.slice(0, 4)).toEqual([100, 100, 100, 100]);
    expect(values[4]).toBeGreaterThan(400);
    expect(values[5]).toBeLessThan(values[4] ?? 0);
    expect(values.at(-1)).toBeLessThan(values[5] ?? 0);
  });

  it('rejects an ambiguous or invalid span', () => {
    expect(() => timeSeries({ ctx, key: 'x', base: 1 })).toThrow(/exactly one/);
    expect(() => timeSeries({ ctx, key: 'x', base: 1, days: 3, weeks: 2 })).toThrow(/exactly one/);
    expect(() => timeSeries({ ctx, key: 'x', base: 1, days: -1 })).toThrow(/integer/);
  });

  it('builds 10k points quickly', () => {
    const started = performance.now();
    const points = timeSeries({ ...base, days: 10_000 });
    const ms = performance.now() - started;
    expect(points).toHaveLength(10_000);
    // Target < 5 ms on a quiet machine; the bound is loose for loaded CI runners.
    console.info(`timeSeries 10k points: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(250);
  });
});

describe('poisson', () => {
  it('averages close to the mean for small and large means', () => {
    const { rng } = createGenerateContext(scenario());
    for (const mean of [0.5, 4, 80]) {
      const n = 4000;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += poisson(rng, mean);
      expect(sum / n).toBeGreaterThan(mean * 0.9);
      expect(sum / n).toBeLessThan(mean * 1.1);
    }
    expect(poisson(rng, 0)).toBe(0);
  });
});

describe('eventStream', () => {
  const options = {
    ctx,
    days: 14,
    ratePerDay: 6,
    kinds: { 'ticket.created': 5, 'ticket.solved': 3, 'ticket.reopened': 0 },
    payload: ({ kind, rng }: { kind: string; rng: { int(a: number, b: number): number } }) => ({
      kind,
      priority: rng.int(1, 4),
    }),
  };

  it('is deterministic, window-stable and uses only positive-weight kinds', () => {
    const two = eventStream({ ...options });
    expect(eventStream({ ...options })).toEqual(two);
    expect(two.length).toBeGreaterThan(14);
    const kinds = new Set(two.map((e) => e.type));
    expect([...kinds].sort()).toEqual(['ticket.created', 'ticket.solved']);
    const longer = eventStream({ ...options, days: 40 });
    const fromTwo = Date.parse(REF) - 14 * MS_PER_DAY;
    expect(longer.filter((e) => Date.parse(e.at) > fromTwo)).toEqual(two);
    for (const event of two) {
      expect(Date.parse(event.at)).toBeLessThanOrEqual(Date.parse(REF));
      expect(event.payload.priority).toBeGreaterThanOrEqual(1);
    }
  });

  it('needs at least one positive weight', () => {
    expect(() => eventStream({ ctx, days: 1, ratePerDay: 1, kinds: { a: 0 } })).toThrow(
      /positive weight/
    );
  });
});

describe('scenarioSeriesOptions', () => {
  it('reads history, seasonality and spikes from preset knobs', () => {
    const launch = presetScenario('launch-spike');
    const options = scenarioSeriesOptions({ scenario: launch });
    expect(options.days).toBe(45);
    expect(options.seasonality).toBe('weekly');
    expect(options.spikes).toEqual([
      {
        at: new Date(Date.parse(launch.referenceTime) - 3 * MS_PER_DAY).toISOString(),
        factor: 5,
        decayDays: 4,
      },
    ]);
    const points = timeSeries({ ctx: { scenario: launch }, key: 'visits', base: 200, ...options });
    expect(points).toHaveLength(45);
  });

  it('falls back to the organization age and no seasonality', () => {
    const plain = scenarioSeriesOptions({ scenario: presetScenario('active-month') });
    expect(plain).toEqual({ days: 30, seasonality: 'none', spikes: [] });
  });
});

describe('determinism hygiene', () => {
  it('scenarios sources never read ambient randomness or clocks', async () => {
    // Untyped import: this package has no Node types, and only the test reads files.
    const fs = (await import('node:fs' as string)) as {
      readdirSync(dir: string): string[];
      readFileSync(file: string, encoding: 'utf8'): string;
    };
    // Vitest sets import.meta.dirname to this file's folder (happy-dom keeps an http url).
    const dir = `${(import.meta as { dirname?: string }).dirname}/../src`;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('series.ts');
    for (const file of files) {
      const text = fs.readFileSync(`${dir}/${file}`, 'utf8');
      expect(text, file).not.toMatch(/Math\.random\(|Date\.now\(|new Date\(\)/);
    }
  });
});
