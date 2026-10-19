import type { GenerateContext } from '@protoyard/core';
import {
  deepMerge,
  fragments,
  type ScenarioFragment,
  type Seasonality,
  type SeriesSpike,
  scenarioSeriesOptions,
} from '@protoyard/scenarios';

/** A dip in a series over whole UTC days: values inside are multiplied by `depth` (0.2 = an 80 % drop). */
export interface SeriesOutage {
  /** Start, in days before the scenario reference time. */
  daysAgo: number;
  /** Length in days (default 1). */
  days?: number;
  /** Remaining share of normal traffic, 0…1 (default 0.15). */
  depth?: number;
}

export interface AnalyticsScenarioOptions {
  days: number;
  seasonality: Seasonality;
  spikes: SeriesSpike[];
  outages: SeriesOutage[];
}

/**
 * The analytics knobs a scenario carries: history, seasonality and spikes
 * from the shared series fragments, plus outages from `generators.analytics`.
 */
export function analyticsScenarioOptions(
  ctx: Pick<GenerateContext, 'scenario'>
): AnalyticsScenarioOptions {
  const series = scenarioSeriesOptions(ctx);
  const raw = (ctx.scenario.generators.analytics ?? {}) as { outages?: unknown };
  const outages = Array.isArray(raw.outages)
    ? raw.outages.filter(
        (o): o is SeriesOutage =>
          typeof o === 'object' && o !== null && typeof (o as SeriesOutage).daysAgo === 'number'
      )
    : [];
  return { ...series, outages };
}

/**
 * Scenario fragments for analytics prototypes. Combine with
 * `composeScenario(base, …)` or a scenario's `extends`.
 */
export const analyticsFragments = {
  /** A launch-day lift `daysAgo` days back that decays over a few days. */
  launchSpike: (daysAgo = 14, factor = 4): ScenarioFragment =>
    deepMerge(
      {},
      fragments.spike(daysAgo, factor, 4),
      fragments.tags('launch')
    ) as ScenarioFragment,
  /** An incident: traffic drops to `depth` of normal for `days` days. */
  outageDip: (daysAgo = 10, days = 1, depth = 0.15): ScenarioFragment => ({
    generators: { analytics: { outages: [{ daysAgo, days, depth }] } },
    tags: ['outage'],
  }),
  /** Weekly and annual rhythm over half a year of history. */
  seasonal: (): ScenarioFragment =>
    deepMerge(
      {},
      fragments.seasonality('weekly+annual'),
      fragments.history(180)
    ) as ScenarioFragment,
  /** A brand-new workspace: no users, no events. */
  empty: (): ScenarioFragment => fragments.density('empty'),
  /** Scale stress: about 25× the default users and events. */
  massive: (): ScenarioFragment => fragments.density('massive'),
};
