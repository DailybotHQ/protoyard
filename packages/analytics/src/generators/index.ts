/*
 * Deterministic analytics generators: metric series with trend, seasonality,
 * noise, spikes and outages; product events with power-law sessions; funnel
 * journeys; retention cohorts; and live-counter timeline events. They use
 * only the scenario context (`ctx.rng` forks, `ctx.ids`, the scenario
 * reference time, `ctx.scale`) and the window-independent series and
 * timeline helpers of @protoyard/scenarios, never Math.random() or Date.now().
 */

/** Bump when generator output can change, so prototypes bump their `generatorVersion`. */
export const ANALYTICS_GENERATOR_VERSION = 1;

export { type GenerateCohortsOptions, generateCohorts } from './cohorts.ts';
export {
  type AnalyticsUser,
  type GenerateFunnelJourneysOptions,
  type GenerateProductEventsOptions,
  generateFunnelJourneys,
  generateProductEvents,
  type PropertyWeights,
} from './events.ts';
export { type LiveCounterOptions, type LiveCounterPayload, liveCounterEvents } from './live.ts';
export {
  type AnalyticsScenarioOptions,
  analyticsFragments,
  analyticsScenarioOptions,
  type SeriesOutage,
} from './options.ts';
export { gaussian, isoString, paretoCount } from './random.ts';
export { type GenerateTimeSeriesOptions, generateMetrics, generateTimeSeries } from './series.ts';
