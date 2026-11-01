import {
  createGenerateContext,
  fragments,
  presetScenario,
  type ScenarioFragment,
} from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import {
  generateCohorts,
  generateFunnelJourneys,
  generateProductEvents,
  generateTimeSeries,
} from '../src/generators/index.ts';

const ctxFor = (...extra: ScenarioFragment[]) =>
  createGenerateContext(
    presetScenario('quarter-of-history', fragments.seasonality('weekly'), ...extra)
  );

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

/** Opt-in: `PROTOYARD_BENCH=1 pnpm vitest run packages/analytics/tests/generators.test.ts`. */
