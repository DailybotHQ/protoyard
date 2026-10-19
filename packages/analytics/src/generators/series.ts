import { type GenerateContext, MS_PER_DAY } from '@protoyard/core';
import { type Seasonality, type SeriesSpike, type Trend, timeSeries } from '@protoyard/scenarios';
import type { MetricPoint } from '../schema.ts';
import { analyticsScenarioOptions, type SeriesOutage } from './options.ts';

export interface GenerateTimeSeriesOptions {
  /** Series name, also its random stream: `'signups'`, `'revenue_cents'`. */
  key: string;
  /** Level at the end of the series. */
  base: number;
  /** Buckets: days (default the scenario history), or weeks/months instead. */
  days?: number;
  weeks?: number;
  months?: number;
  trend?: Trend | number;
  seasonality?: Seasonality;
  /** Relative noise amplitude 0…1 (default 0.1). */
  noise?: number;
  spikes?: readonly SeriesSpike[];
  outages?: readonly SeriesOutage[];
  /** Round to integers (default true: counts and integer cents). */
  integer?: boolean;
  min?: number;
}

/**
 * A metric series ending at the scenario reference time, built on
 * `timeSeries` from @protoyard/scenarios (each bucket comes from the scenario
 * seed, the key and the bucket date, so more history never changes earlier
 * values), with outage dips on top. Scenario knobs (history, seasonality,
 * spikes, outages) apply unless overridden.
 */
export function generateTimeSeries(
  ctx: GenerateContext,
  options: GenerateTimeSeriesOptions
): MetricPoint[] {
  const scenario = analyticsScenarioOptions(ctx);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const count = options.weeks
    ? { weeks: options.weeks }
    : options.months
      ? { months: options.months }
      : { days: options.days ?? Math.max(1, scenario.days) };
  const integer = options.integer ?? true;
  const points = timeSeries({
    ctx,
    key: `analytics:${options.key}`,
    ...count,
    base: options.base,
    trend: options.trend ?? 'growth',
    seasonality: options.seasonality ?? scenario.seasonality,
    noise: options.noise ?? 0.1,
    spikes: options.spikes ?? scenario.spikes,
    min: options.min ?? 0,
    integer: false,
  });
  // Outages cover whole UTC days, starting on the day `daysAgo` days before the reference time.
  const outages = (options.outages ?? scenario.outages).map((o) => {
    const start = Math.floor((ref - o.daysAgo * MS_PER_DAY) / MS_PER_DAY) * MS_PER_DAY;
    return {
      start,
      end: start + Math.max(1, o.days ?? 1) * MS_PER_DAY,
      depth: Math.min(1, Math.max(0, o.depth ?? 0.15)),
    };
  });
  return points.map((p) => {
    const at = Date.parse(p.at);
    let value = p.value;
    for (const o of outages) if (at >= o.start && at < o.end) value *= o.depth;
    return { at, value: integer ? Math.round(value) : value };
  });
}

/** Several metrics at once, keyed by their `key`. */
export function generateMetrics(
  ctx: GenerateContext,
  metrics: readonly GenerateTimeSeriesOptions[]
): Record<string, MetricPoint[]> {
  return Object.fromEntries(metrics.map((m) => [m.key, generateTimeSeries(ctx, m)]));
}
