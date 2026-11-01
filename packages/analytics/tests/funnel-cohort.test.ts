import { describe, expect, it } from 'vitest';
import { computeRetention } from '../src/cohort.ts';
import { computeFunnel, type FunnelEvent, type FunnelStep } from '../src/funnel.ts';

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
});
