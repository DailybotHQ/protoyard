import { MS_PER_DAY } from '@protoyard/core';
import {
  createGenerateContext,
  fragments,
  presetScenario,
  type ScenarioFragment,
} from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { computeRetention } from '../src/cohort.ts';
import { computeFunnel } from '../src/funnel.ts';
import {
  analyticsFragments,
  generateCohorts,
  generateFunnelJourneys,
  generateMetrics,
  generateProductEvents,
  generateTimeSeries,
  liveCounterEvents,
  paretoCount,
} from '../src/generators/index.ts';
import { AnalyticsEventSchema } from '../src/schema.ts';

const ctxFor = (...extra: ScenarioFragment[]) =>
  createGenerateContext(
    presetScenario('quarter-of-history', fragments.seasonality('weekly'), ...extra)
  );
const REF = Date.parse(presetScenario('quarter-of-history').referenceTime);

const EVENT_TYPES = { page_view: 6, feature_used: 3, export: 1 };
const PROPS = {
  plan: [
    ['free', 6],
    ['pro', 3],
    ['team', 1],
  ],
  country: [
    ['NZ', 1],
    ['CA', 1],
    ['DE', 1],
  ],
} as const;

describe('determinism', () => {
  it('produces byte-identical output for the same seed and different output for another seed', () => {
    const run = (seed?: number) => {
      const ctx = createGenerateContext(
        presetScenario(
          'quarter-of-history',
          fragments.seasonality('weekly'),
          ...(seed ? [{ seed }] : [])
        )
      );
      return JSON.stringify({
        series: generateTimeSeries(ctx, { key: 'signups', base: 120 }),
        events: generateProductEvents(ctx, {
          users: 50,
          eventTypes: EVENT_TYPES,
          firstEvent: 'signup',
          properties: PROPS,
        }),
        funnel: generateFunnelJourneys(ctx, {
          steps: ['visit', 'signup', 'paid'],
          conversion: [0.5, 0.3],
          users: 50,
        }),
        cohorts: generateCohorts(ctx, { cohortSize: 20, cohorts: 4 }),
      });
    };
    expect(run()).toBe(run());
    expect(run(424242)).not.toBe(run());
  });

  it('keeps streams independent: changing one generator call does not change another', () => {
    const a = ctxFor();
    const b = ctxFor();
    generateProductEvents(b, { users: 30, eventTypes: EVENT_TYPES, key: 'other' });
    expect(generateTimeSeries(a, { key: 'revenue', base: 5000 })).toEqual(
      generateTimeSeries(b, { key: 'revenue', base: 5000 })
    );
  });
});

describe('generateTimeSeries', () => {
  it('ends at the reference time with integer values over the scenario history', () => {
    const points = generateTimeSeries(ctxFor(), { key: 'signups', base: 100 });
    expect(points).toHaveLength(90);
    expect(points.at(-1)?.at).toBe(Math.floor(REF / MS_PER_DAY) * MS_PER_DAY);
    for (const p of points) expect(Number.isInteger(p.value)).toBe(true);
  });

  it('shows weekly seasonality: weekday mean above weekend mean', () => {
    const points = generateTimeSeries(ctxFor(), {
      key: 'sessions',
      base: 1000,
      trend: 'flat',
      noise: 0.05,
    });
    const weekend = points.filter((p) => [0, 6].includes(new Date(p.at).getUTCDay()));
    const weekday = points.filter((p) => ![0, 6].includes(new Date(p.at).getUTCDay()));
    const mean = (xs: typeof points) => xs.reduce((s, p) => s + p.value, 0) / xs.length;
    expect(mean(weekday)).toBeGreaterThan(mean(weekend) * 1.4);
  });

  it('dips inside an outage window and lifts after a launch spike', () => {
    const base = generateTimeSeries(ctxFor(), { key: 'requests', base: 1000, trend: 'flat' });
    const outage = generateTimeSeries(ctxFor(analyticsFragments.outageDip(10, 2, 0.1)), {
      key: 'requests',
      base: 1000,
      trend: 'flat',
    });
    const start = Math.floor((REF - 10 * MS_PER_DAY) / MS_PER_DAY) * MS_PER_DAY;
    outage.forEach((p, i) => {
      const inside = p.at >= start && p.at < start + 2 * MS_PER_DAY;
      const normal = base[i]?.value as number;
      if (inside) expect(p.value).toBeLessThanOrEqual(Math.ceil(normal * 0.1));
      else expect(p.value).toBe(normal);
    });
    const spiked = generateTimeSeries(ctxFor(analyticsFragments.launchSpike(14, 4)), {
      key: 'requests',
      base: 1000,
      trend: 'flat',
    });
    const day = Math.floor((REF - 14 * MS_PER_DAY) / MS_PER_DAY) * MS_PER_DAY;
    const at = (xs: typeof base) => xs.find((p) => p.at === day)?.value as number;
    expect(at(spiked)).toBeGreaterThan(at(base) * 3);
  });

  it('generates many metrics at once', () => {
    const metrics = generateMetrics(
      ctxFor(),
      Array.from({ length: 10 }, (_, i) => ({ key: `m${i}`, base: 100 + i * 10 }))
    );
    expect(Object.keys(metrics)).toHaveLength(10);
    expect(metrics.m3).toHaveLength(90);
  });
});

describe('generateProductEvents', () => {
  it('creates users and valid, time-ordered events with their properties', () => {
    const { users, events } = generateProductEvents(ctxFor(), {
      users: 200,
      eventTypes: EVENT_TYPES,
      firstEvent: 'signup',
      properties: PROPS,
    });
    expect(users).toHaveLength(200);
    expect(events.length).toBeGreaterThan(500);
    for (const e of events.slice(0, 50))
      expect(AnalyticsEventSchema.safeParse(e).success).toBe(true);
    for (let i = 1; i < events.length; i++)
      expect((events[i]?.at as string) >= (events[i - 1]?.at as string)).toBe(true);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(events.every((e) => Date.parse(e.at) <= REF)).toBe(true);
    expect(events.filter((e) => e.type === 'signup')).toHaveLength(200);
    const user = users[0];
    expect(events.find((e) => e.userId === user?.id)?.properties).toEqual(user?.properties);
  });

  it('gives a power-law activity distribution: a few heavy users, many light ones', () => {
    const { users, events } = generateProductEvents(ctxFor(), {
      users: 500,
      eventTypes: EVENT_TYPES,
      sessionsPerUser: { mean: 5 },
    });
    const perUser = users
      .map((u) => events.filter((e) => e.userId === u.id).length)
      .sort((a, b) => b - a);
    const top10 = perUser.slice(0, 50).reduce((s, n) => s + n, 0);
    expect(top10 / events.length).toBeGreaterThan(0.25);
    expect(perUser.at(-1)).toBeGreaterThanOrEqual(1);
    const ctx = ctxFor();
    const samples = Array.from({ length: 4000 }, () => paretoCount(ctx.rng, 4, 1.4, 10_000));
    const mean = samples.reduce((s, n) => s + n, 0) / samples.length;
    expect(mean).toBeGreaterThan(2.5);
    expect(mean).toBeLessThan(6);
  });

  it('respects density: empty scenarios have no users, massive ones many more', () => {
    expect(
      generateProductEvents(ctxFor(analyticsFragments.empty()), { eventTypes: EVENT_TYPES }).users
    ).toHaveLength(0);
    const normal = generateProductEvents(ctxFor(), { users: 40, eventTypes: EVENT_TYPES }).users
      .length;
    const massive = generateProductEvents(ctxFor(analyticsFragments.massive()), {
      users: 40,
      eventTypes: EVENT_TYPES,
    }).users.length;
    expect(massive).toBeGreaterThan(normal * 10);
  });
});

describe('funnels and cohorts', () => {
  it('generates journeys whose computed funnel matches the conversion rates', () => {
    const events = generateFunnelJourneys(ctxFor(), {
      steps: ['visit', 'signup', 'activate', 'subscribe'],
      conversion: [0.5, 0.6, 0.3],
      users: 2000,
    });
    const { steps } = computeFunnel(
      events,
      ['visit', 'signup', 'activate', 'subscribe'].map((t) => ({ id: t, label: t, eventType: t }))
    );
    expect(steps[0]?.count).toBe(2000);
    expect(steps[1]?.stepConversion).toBeGreaterThan(0.44);
    expect(steps[1]?.stepConversion).toBeLessThan(0.56);
    expect(steps[3]?.stepConversion).toBeGreaterThan(0.22);
    expect(steps[3]?.stepConversion).toBeLessThan(0.38);
  });

  it('generates cohorts whose retention follows the curve', () => {
    const events = generateCohorts(ctxFor(), {
      cohorts: 6,
      cohortSize: 400,
      retention: { initial: 0.5, decay: 0.7 },
    });
    const result = computeRetention(events, {
      cohortEvent: 'signup',
      returnEvent: 'session_start',
      interval: 'week',
      periods: 3,
      now: REF,
    });
    expect(result.cohorts).toHaveLength(6);
    expect(result.average[1]).toBeGreaterThan(0.44);
    expect(result.average[1]).toBeLessThan(0.56);
    expect(result.average[2]).toBeGreaterThan(0.29);
    expect(result.average[2]).toBeLessThan(0.41);
  });
});

describe('liveCounterEvents', () => {
  const ctx = presetScenario('quarter-of-history');
  const start = new Date(REF);
  const days = (n: number) => new Date(REF + n * MS_PER_DAY);

  it('is window independent: one 7-day advance equals seven 1-day advances', () => {
    const once = liveCounterEvents(
      { scenario: ctx },
      { counter: 'active_users', perDay: 40, from: start, to: days(7) }
    );
    const steps = Array.from({ length: 7 }, (_, i) =>
      liveCounterEvents(
        { scenario: ctx },
        { counter: 'active_users', perDay: 40, from: days(i), to: days(i + 1) }
      )
    ).flat();
    expect(once.length).toBeGreaterThan(100);
    expect(steps).toEqual(once);
    expect(once[0]?.payload.counter).toBe('active_users');
    expect(once.every((e) => e.payload.delta >= 1 && e.payload.delta <= 3)).toBe(true);
  });
});

/** Opt-in: `PROTOYARD_BENCH=1 pnpm vitest run packages/analytics/tests/generators.test.ts`. */
describe.skipIf(!process.env.PROTOYARD_BENCH)('generation benchmark (Node)', () => {
  it('90 days × 10 metrics + 20k events from 2k users stays inside the budget', () => {
    const run = () => {
      const ctx = ctxFor();
      const t = performance.now();
      generateMetrics(
        ctx,
        Array.from({ length: 10 }, (_, i) => ({ key: `m${i}`, base: 100 + i }))
      );
      const { events } = generateProductEvents(ctx, {
        users: 2000,
        eventTypes: EVENT_TYPES,
        properties: PROPS,
        sessionsPerUser: { mean: 4 },
      });
      return { ms: performance.now() - t, events: events.length };
    };
    const samples = Array.from({ length: 5 }, run).sort((a, b) => a.ms - b.ms);
    const median = samples[2] as { ms: number; events: number };
    console.info(
      `BENCH analytics generate: ${median.ms.toFixed(1)} ms for ${median.events} events (median of 5)`
    );
    expect(median.events).toBeGreaterThan(15_000);
    expect(median.ms).toBeLessThan(50);
  });
});
