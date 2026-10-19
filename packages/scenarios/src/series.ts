import {
  createRng,
  type DomainEvent,
  type GenerateContext,
  MS_PER_DAY,
  type Rng,
} from '@protoyard/core';
import { dailyEvents } from './timeline.ts';

/**
 * Time-series and event-stream helpers for charts, analytics and activity
 * feeds. Like `dailyEvents`, every value depends only on the scenario (id,
 * seed), the series key and the bucket's own date — never on the requested
 * window. Trends are anchored at the series end (`to`, by default the
 * scenario reference time), so asking for more history adds older points
 * without changing the ones you already had.
 */

type ScenarioCtx = Pick<GenerateContext, 'scenario'>;

export type SeriesUnit = 'day' | 'week' | 'month';
export type Seasonality = 'none' | 'weekly' | 'annual' | 'weekly+annual';
export type Trend = 'flat' | 'growth' | 'decline';

/** A temporary lift that decays exponentially: `factor` at `at`, back to 1 over `decayDays`. */
export interface SeriesSpike {
  at: string | Date;
  /** Multiplier at the spike (for example 4 for a launch day). */
  factor: number;
  /** e-folding time in days (default 3). */
  decayDays?: number;
}

export interface TimeSeriesOptions {
  ctx: ScenarioCtx;
  /** Separate series of one scenario: `'signups'`, `'revenue'`… */
  key: string;
  /** Exactly one of `days`, `weeks` or `months`: the number of buckets. */
  days?: number;
  weeks?: number;
  months?: number;
  /** Last instant covered (default the scenario reference time). */
  to?: Date;
  /** Level at the series end, before seasonality, spikes and noise. */
  base: number;
  /** `growth` is +8 % and `decline` −5 % per 30 days; a number is a custom rate per 30 days. */
  trend?: Trend | number;
  seasonality?: Seasonality;
  /** Relative noise amplitude in [0, 1] (default 0.1). */
  noise?: number;
  spikes?: readonly SeriesSpike[];
  /** Clamp bounds (default min 0). */
  min?: number;
  max?: number;
  /** Round values to integers (default true; use for counts and money cents). */
  integer?: boolean;
}

export interface SeriesPoint {
  /** Bucket start, UTC (midnight; Monday for weeks; the 1st for months). */
  at: string;
  value: number;
}

const TREND_RATES: Record<Trend, number> = { flat: 0, growth: 0.08, decline: -0.05 };
/** Weekday multipliers, Sunday first: quieter weekends, busy mid-week. */
const WEEKDAY_FACTOR = [0.55, 1.05, 1.1, 1.12, 1.08, 0.98, 0.6] as const;

/** UTC start of the bucket that contains `ms`. */
export function bucketStart(ms: number, unit: SeriesUnit): number {
  const day = Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
  if (unit === 'day') return day;
  if (unit === 'week') {
    const weekday = new Date(day).getUTCDay();
    return day - ((weekday + 6) % 7) * MS_PER_DAY;
  }
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/** Start of the bucket `steps` buckets before (negative) or after `start`. */
function shiftBucket(start: number, unit: SeriesUnit, steps: number): number {
  if (unit === 'day') return start + steps * MS_PER_DAY;
  if (unit === 'week') return start + steps * 7 * MS_PER_DAY;
  const date = new Date(start);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + steps, 1);
}

function span(options: Pick<TimeSeriesOptions, 'days' | 'weeks' | 'months'>): {
  unit: SeriesUnit;
  count: number;
} {
  const given = (['days', 'weeks', 'months'] as const).filter((k) => options[k] !== undefined);
  if (given.length !== 1) {
    throw new RangeError('timeSeries(): pass exactly one of days, weeks or months');
  }
  const key = given[0] as 'days' | 'weeks' | 'months';
  const count = options[key] as number;
  if (!Number.isInteger(count) || count < 0 || count > 100_000) {
    throw new RangeError(`timeSeries(): ${key} must be an integer between 0 and 100000`);
  }
  return { unit: key === 'days' ? 'day' : key === 'weeks' ? 'week' : 'month', count };
}

const seriesSeed = (ctx: ScenarioCtx, key: string) =>
  `protoyard:series:${ctx.scenario.id}:${ctx.scenario.seed}:${key}:`;

/** Rng for one bucket of one series: stable whatever the window. */
export function seriesRng(ctx: ScenarioCtx, key: string, at: string): Rng {
  return createRng(`${seriesSeed(ctx, key)}${at}`);
}

/** FNV-1a over `text`, continuing from `hash` (same as core `hashString` on the joined text). */
function fnv(hash: number, text: string): number {
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * `seriesRng(ctx, key, at).next()` without building an rng per bucket: the
 * long prefix is hashed once, then one mulberry32 step (as in core `createRng`).
 */
function bucketNoise(prefixHash: number, at: string): number {
  let t = (fnv(prefixHash, at) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function seasonalFactor(ms: number, unit: SeriesUnit, seasonality: Seasonality): number {
  let factor = 1;
  if (unit === 'day' && (seasonality === 'weekly' || seasonality === 'weekly+annual')) {
    factor *= WEEKDAY_FACTOR[new Date(ms).getUTCDay()] as number;
  }
  if (seasonality === 'annual' || seasonality === 'weekly+annual') {
    const date = new Date(ms);
    const dayOfYear = (ms - Date.UTC(date.getUTCFullYear(), 0, 1)) / MS_PER_DAY;
    // Peak in early December, trough in early June.
    factor *= 1 + 0.15 * Math.cos((2 * Math.PI * (dayOfYear - 340)) / 365);
  }
  return factor;
}

function spikeFactor(ms: number, spikes: readonly SeriesSpike[]): number {
  let factor = 1;
  for (const spike of spikes) {
    const at = typeof spike.at === 'string' ? Date.parse(spike.at) : spike.at.getTime();
    if (Number.isNaN(at) || ms < Math.floor(at / MS_PER_DAY) * MS_PER_DAY) continue;
    const days = (ms - at) / MS_PER_DAY;
    factor *= 1 + (spike.factor - 1) * Math.exp(-Math.max(0, days) / (spike.decayDays ?? 3));
  }
  return factor;
}

/**
 * A deterministic series of `days`, `weeks` or `months` buckets ending at the
 * bucket that contains `to`. Example: 90 days of signups with weekly rhythm.
 *
 * ```ts
 * timeSeries({ ctx, key: 'signups', days: 90, base: 40, trend: 'growth', seasonality: 'weekly' })
 * ```
 */
export function timeSeries(options: TimeSeriesOptions): SeriesPoint[] {
  const { unit, count } = span(options);
  const endMs = (options.to ?? new Date(options.ctx.scenario.referenceTime)).getTime();
  const rate =
    typeof options.trend === 'number' ? options.trend : TREND_RATES[options.trend ?? 'flat'];
  const noise = Math.min(1, Math.max(0, options.noise ?? 0.1));
  const min = options.min ?? 0;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const integer = options.integer ?? true;
  const last = bucketStart(endMs, unit);
  const prefixHash = fnv(0x811c9dc5, seriesSeed(options.ctx, options.key));

  const points: SeriesPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ms = shiftBucket(last, unit, -i);
    const at = new Date(ms).toISOString();
    const daysBeforeEnd = (last - ms) / MS_PER_DAY;
    let value = options.base * (1 + rate) ** (-daysBeforeEnd / 30);
    value *= seasonalFactor(ms, unit, options.seasonality ?? 'none');
    value *= spikeFactor(ms, options.spikes ?? []);
    value *= 1 + noise * (2 * bucketNoise(prefixHash, at) - 1);
    value = Math.min(max, Math.max(min, value));
    points.push({ at, value: integer ? Math.round(value) : value });
  }
  return points;
}

export interface EventStreamOptions<TPayload> {
  ctx: ScenarioCtx;
  /** Days of history ending at `to` (default the scenario reference time). */
  days: number;
  to?: Date;
  /** Mean events per day (before seasonality and bursts). */
  ratePerDay: number;
  /** Event types and their relative weights: `{ 'ticket.created': 5, 'ticket.solved': 3 }`. */
  kinds: Readonly<Record<string, number>>;
  seasonality?: Seasonality;
  /** Share of days that are bursts with 3× the rate, in [0, 1] (default 0.1). */
  burstiness?: number;
  /** UTC hour range (default 8–18). */
  hours?: readonly [number, number];
  /** Payload for each event; use `rng`, never Math.random. Default `{}`. */
  payload?: (event: { kind: string; at: Date; index: number; rng: Rng }) => TPayload;
}

/** Poisson sample (Knuth for small means, a normal approximation above 30). */
export function poisson(rng: Rng, mean: number): number {
  if (!(mean > 0)) return 0;
  if (mean > 30) {
    const u = Math.max(rng.next(), Number.EPSILON);
    const gauss = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss));
  }
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng.next();
  while (p > limit) {
    k++;
    p *= rng.next();
  }
  return k;
}

/**
 * Poisson-like daily activity built on `dailyEvents`: same window
 * independence, same `evt:<scenario>:<day>:<index>` ids.
 */
export function eventStream<TPayload = Record<string, never>>(
  options: EventStreamOptions<TPayload>
): DomainEvent<TPayload>[] {
  const entries = Object.entries(options.kinds).filter(([, weight]) => weight > 0);
  if (entries.length === 0) throw new RangeError('eventStream(): kinds needs a positive weight');
  const to = options.to ?? new Date(options.ctx.scenario.referenceTime);
  const from = new Date(to.getTime() - options.days * MS_PER_DAY);
  const burstiness = Math.min(1, Math.max(0, options.burstiness ?? 0.1));
  const seasonality = options.seasonality ?? 'weekly';

  return dailyEvents<TPayload>(options.ctx, {
    from,
    to,
    ...(options.hours ? { hours: options.hours } : {}),
    perDay: ({ day, rng }) => {
      const burst = rng.chance(burstiness) ? 3 : 1;
      return poisson(
        rng,
        options.ratePerDay * burst * seasonalFactor(day.getTime(), 'day', seasonality)
      );
    },
    make: ({ at, index, rng }) => {
      const kind = rng.weighted(entries);
      const payload = options.payload
        ? options.payload({ kind, at, index, rng: rng.fork('payload') })
        : ({} as TPayload);
      return { type: kind, payload };
    },
  });
}

/**
 * Series knobs a scenario carries in `generators.series` (set by the
 * `history`, `seasonality` and `spike` fragments), resolved against the
 * scenario reference time. Generators spread them into `timeSeries`.
 */
export function scenarioSeriesOptions(ctx: ScenarioCtx): {
  days: number;
  seasonality: Seasonality;
  spikes: SeriesSpike[];
} {
  const raw = (ctx.scenario.generators.series ?? {}) as {
    historyDays?: unknown;
    seasonality?: unknown;
    spikes?: unknown;
  };
  const ref = Date.parse(ctx.scenario.referenceTime);
  const days =
    typeof raw.historyDays === 'number' && raw.historyDays >= 0
      ? Math.floor(raw.historyDays)
      : Math.max(1, ctx.scenario.organization.ageDays);
  const seasonality = (['none', 'weekly', 'annual', 'weekly+annual'] as const).includes(
    raw.seasonality as Seasonality
  )
    ? (raw.seasonality as Seasonality)
    : 'none';
  const spikes = Array.isArray(raw.spikes)
    ? raw.spikes.flatMap((spike: { daysAgo?: unknown; factor?: unknown; decayDays?: unknown }) =>
        typeof spike?.daysAgo === 'number' && typeof spike.factor === 'number'
          ? [
              {
                at: new Date(ref - spike.daysAgo * MS_PER_DAY).toISOString(),
                factor: spike.factor,
                ...(typeof spike.decayDays === 'number' ? { decayDays: spike.decayDays } : {}),
              },
            ]
          : []
      )
    : [];
  return { days, seasonality, spikes };
}
