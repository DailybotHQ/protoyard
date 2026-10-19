import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { computeRetention } from '../src/cohort.ts';
import { computeFunnel, type FunnelEvent, type FunnelStep, NO_VALUE } from '../src/funnel.ts';

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.parse('2026-03-02T00:00:00.000Z'); // a Monday
const ev = (
  userId: string,
  type: string,
  at: number,
  properties: Record<string, unknown> = {}
): FunnelEvent => ({
  userId,
  type,
  at,
  properties,
});

const STEPS: FunnelStep[] = [
  { id: 'visit', label: 'Visited', eventType: 'visit' },
  { id: 'signup', label: 'Signed up', eventType: 'signup' },
  { id: 'paid', label: 'Paid', eventType: 'checkout' },
];

const EVENTS: FunnelEvent[] = [
  // u1 converts fully: 1 h to sign up, 2 h to pay.
  ev('u1', 'visit', T0, { plan: 'pro' }),
  ev('u1', 'signup', T0 + H),
  ev('u1', 'checkout', T0 + 3 * H),
  // u2 signs up after 3 h, never pays.
  ev('u2', 'visit', T0, { plan: 'free' }),
  ev('u2', 'signup', T0 + 3 * H),
  // u3 pays before visiting: order matters, so that checkout does not count.
  ev('u3', 'checkout', T0 + H, { plan: 'pro' }),
  ev('u3', 'visit', T0 + 2 * H, { plan: 'pro' }),
  ev('u3', 'signup', T0 + 5 * H),
  // u4 converts too slowly for a 2-day window (signup after 3 days).
  ev('u4', 'visit', T0, {}),
  ev('u4', 'signup', T0 + 3 * D),
  // u5 never enters (no visit).
  ev('u5', 'signup', T0),
  // Events arrive out of order: u6 still converts, 2 h then 4 h.
  ev('u6', 'checkout', T0 + 6 * H),
  ev('u6', 'visit', '2026-03-02T00:00:00.000Z' as unknown as number, { plan: 'pro' }),
  ev('u6', 'signup', T0 + 2 * H),
];

describe('computeFunnel', () => {
  it('counts ordered steps, conversion and drop-off with known answers', () => {
    const { steps } = computeFunnel(EVENTS, STEPS);
    expect(steps.map((s) => s.count)).toEqual([5, 5, 2]);
    expect(steps.map((s) => s.conversion)).toEqual([1, 1, 0.4]);
    expect(steps.map((s) => s.stepConversion)).toEqual([1, 1, 0.4]);
    expect(steps.map((s) => s.dropOff)).toEqual([0, 0, 3]);
  });

  it('reports the median time between consecutive steps', () => {
    const { steps } = computeFunnel(EVENTS, STEPS);
    // Signup delays: u1 1 h, u2 3 h, u3 3 h, u4 72 h, u6 2 h → median 3 h.
    expect(steps[1]?.medianTimeToConvert).toBe(3 * H);
    // Payment delays: u1 2 h, u6 4 h → median 3 h.
    expect(steps[2]?.medianTimeToConvert).toBe(3 * H);
    expect(steps[0]?.medianTimeToConvert).toBeNull();
  });

  it('applies the conversion window from the first step', () => {
    const { steps } = computeFunnel(EVENTS, STEPS, { window: 2 * D });
    expect(steps.map((s) => s.count)).toEqual([5, 4, 2]);
    expect(computeFunnel(EVENTS, STEPS, { window: 2 * H }).steps.map((s) => s.count)).toEqual([
      5, 2, 0,
    ]);
  });

  it('splits by a property of the entry event, with a (none) group', () => {
    const { breakdown } = computeFunnel(EVENTS, STEPS, { breakdown: 'properties.plan' });
    expect(breakdown?.map((b) => [b.key, b.steps.map((s) => s.count)])).toEqual([
      ['pro', [3, 3, 2]],
      ['(none)', [1, 1, 0]],
      ['free', [1, 1, 0]],
    ]);
    expect(NO_VALUE).toBe('(none)');
    expect(breakdown?.find((b) => b.key === 'pro')?.steps[2]?.conversion).toBeCloseTo(2 / 3, 10);
  });

  it('honours a range and handles empty input', () => {
    expect(
      computeFunnel(EVENTS, STEPS, { range: { start: T0 + H, end: T0 + D } }).steps[0]?.count
    ).toBe(1);
    const empty = computeFunnel([], STEPS).steps;
    expect(empty.map((s) => s.count)).toEqual([0, 0, 0]);
    expect(empty[0]?.conversion).toBeNull();
    expect(empty[1]?.stepConversion).toBeNull();
  });
});

describe('computeRetention', () => {
  // Weekly cohorts by signup; return = any later "session" event.
  const W = 7 * D;
  const events: FunnelEvent[] = [
    // Cohort week 0 (Mar 2): a, b, c
    ev('a', 'signup', T0 + D),
    ev('a', 'session', T0 + W + D), // week 1
    ev('a', 'session', T0 + 3 * W), // week 3
    ev('b', 'signup', T0 + 2 * D),
    ev('b', 'session', T0 + W + 2 * D), // week 1
    ev('b', 'session', T0 + 2 * W + D), // week 2
    ev('c', 'signup', T0 + 3 * D),
    ev('c', 'session', T0 + 3 * D + H), // same week: period 0 only
    // Cohort week 1 (Mar 9): d
    ev('d', 'signup', T0 + W),
    ev('d', 'session', T0 + 2 * W + H), // week 1 for d
    // Not in any cohort: no signup.
    ev('z', 'session', T0),
  ];
  const now = T0 + 3 * W + 3 * D; // Thursday of week 3

  it('builds a bounded cohort × period matrix with counts and rates', () => {
    const result = computeRetention(events, {
      cohortEvent: 'signup',
      returnEvent: 'session',
      interval: 'week',
      periods: 3,
      now,
    });
    expect(
      result.cohorts.map((c) => [new Date(c.start).toISOString().slice(0, 10), c.size])
    ).toEqual([
      ['2026-03-02', 3],
      ['2026-03-09', 1],
    ]);
    const first = result.cohorts[0]?.cells ?? [];
    expect(first.map((c) => c.count)).toEqual([3, 2, 1, 1]);
    expect(first[1]?.rate).toBeCloseTo(2 / 3, 10);
    const second = result.cohorts[1]?.cells ?? [];
    expect(second.map((c) => c.count)).toEqual([1, 1, 0, null]);
  });

  it('flags incomplete and future periods against now', () => {
    const result = computeRetention(events, {
      cohortEvent: 'signup',
      returnEvent: 'session',
      interval: 'week',
      periods: 3,
      now,
    });
    expect(result.cohorts[0]?.cells.map((c) => c.incomplete)).toEqual([false, false, false, true]);
    // Cohort 2's period 2 is the current week (partial); period 3 has not started.
    expect(result.cohorts[1]?.cells.map((c) => c.incomplete)).toEqual([false, false, true, true]);
    expect(result.cohorts[1]?.cells[3]).toMatchObject({ count: null, rate: null });
    // Averages use complete cells only: period 1 = (2 + 1) / (3 + 1).
    expect(result.average[1]).toBeCloseTo(3 / 4, 10);
    expect(result.average[2]).toBeCloseTo(1 / 3, 10);
    expect(result.average[3]).toBeNull();
  });

  it('unbounded retention counts users still active later, so rates never rise', () => {
    const result = computeRetention(events, {
      cohortEvent: 'signup',
      returnEvent: 'session',
      interval: 'week',
      periods: 3,
      now,
      mode: 'unbounded',
    });
    // a returns in weeks 1 and 3, b in weeks 1 and 2: both "still around" in week 2.
    expect(result.cohorts[0]?.cells.map((c) => c.count)).toEqual([3, 2, 2, 1]);
    for (const row of result.cohorts) {
      const rates = row.cells.map((c) => c.rate).filter((r): r is number => r !== null);
      for (let i = 1; i < rates.length; i++)
        expect(rates[i]).toBeLessThanOrEqual(rates[i - 1] as number);
    }
  });

  it('defaults to first-seen cohorts and supports day and month intervals', () => {
    const monthly = computeRetention(
      [
        ev('m', 'open', Date.parse('2026-01-31T10:00:00Z')),
        ev('m', 'open', Date.parse('2026-02-01T10:00:00Z')),
        ev('m', 'open', Date.parse('2026-04-15T10:00:00Z')),
      ],
      { interval: 'month', periods: 3, now: Date.parse('2026-05-01T00:00:00Z') }
    );
    expect(monthly.cohorts[0]?.cells.map((c) => c.count)).toEqual([1, 1, 0, 1]);
    const daily = computeRetention([ev('d', 'open', T0), ev('d', 'open', T0 + D + H)], {
      interval: 'day',
      periods: 2,
      now: T0 + 10 * D,
    });
    expect(daily.cohorts[0]?.cells.map((c) => c.count)).toEqual([1, 1, 0]);
    expect(computeRetention([], { interval: 'week', periods: 4, now }).cohorts).toEqual([]);
  });
});

describe('scale', () => {
  it('computes a funnel and retention over 100k events from 10k users', { timeout: 60_000 }, () => {
    const rng = createRng('funnel-cohort-scale');
    const types = ['visit', 'signup', 'checkout', 'session'];
    const events: FunnelEvent[] = [];
    for (let u = 0; u < 10_000; u++) {
      let at = T0 + rng.int(0, 28) * D;
      for (let k = 0; k < 10; k++) {
        at += rng.int(1, 48) * H;
        events.push({
          userId: `u${u}`,
          type: types[k === 0 ? 0 : rng.int(0, 3)] as string,
          at,
          properties: { plan: rng.pick(['free', 'pro']) },
        });
      }
    }
    const median = (fn: () => void) => {
      const times = Array.from({ length: 5 }, () => {
        const t = performance.now();
        fn();
        return performance.now() - t;
      }).sort((a, b) => a - b);
      return times[2] as number;
    };
    const funnel = computeFunnel(events, STEPS, { window: 14 * D, breakdown: 'properties.plan' });
    const retention = computeRetention(events, {
      cohortEvent: 'signup',
      interval: 'week',
      periods: 8,
      now: T0 + 90 * D,
    });
    const funnelMs = median(() =>
      computeFunnel(events, STEPS, { window: 14 * D, breakdown: 'properties.plan' })
    );
    const retentionMs = median(() =>
      computeRetention(events, {
        cohortEvent: 'signup',
        interval: 'week',
        periods: 8,
        now: T0 + 90 * D,
      })
    );
    expect(funnel.steps[0]?.count).toBe(10_000);
    expect(funnel.steps[1]?.count).toBeGreaterThan(0);
    expect(retention.cohorts.length).toBeGreaterThan(0);
    // Reported, not asserted here (machine load varies); PROTOYARD_BENCH=1 asserts the 50 ms budget.
    console.info(
      `funnel 100k events / 10k users: ${funnelMs.toFixed(1)} ms; retention: ${retentionMs.toFixed(1)} ms`
    );
    if (process.env.PROTOYARD_BENCH) expect(funnelMs).toBeLessThan(50);
  });
});
