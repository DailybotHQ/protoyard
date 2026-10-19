import type { Extent } from '../types.ts';
import type { ContinuousScale } from './continuous.ts';
import { linearScale } from './continuous.ts';
import { tickStep } from './ticks.ts';

/*
 * Time scales over epoch milliseconds, always in UTC: ticks never shift with
 * the viewer's time zone or daylight-saving changes, and nothing reads the
 * wall clock (the domain comes from the caller, e.g. the simulated clock).
 */

export type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface TimeInterval {
  unit: TimeUnit;
  step: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const UNIT_MS: Record<TimeUnit, number> = {
  second: SECOND,
  minute: MINUTE,
  hour: HOUR,
  day: DAY,
  week: WEEK,
  month: MONTH,
  year: YEAR,
};

/** Candidate intervals, shortest first (approximate durations for choosing). */
const INTERVALS: readonly TimeInterval[] = [
  { unit: 'second', step: 1 },
  { unit: 'second', step: 5 },
  { unit: 'second', step: 15 },
  { unit: 'second', step: 30 },
  { unit: 'minute', step: 1 },
  { unit: 'minute', step: 5 },
  { unit: 'minute', step: 15 },
  { unit: 'minute', step: 30 },
  { unit: 'hour', step: 1 },
  { unit: 'hour', step: 3 },
  { unit: 'hour', step: 6 },
  { unit: 'hour', step: 12 },
  { unit: 'day', step: 1 },
  { unit: 'day', step: 2 },
  { unit: 'week', step: 1 },
  { unit: 'month', step: 1 },
  { unit: 'month', step: 3 },
  { unit: 'year', step: 1 },
];

export function intervalMs(interval: TimeInterval): number {
  return UNIT_MS[interval.unit] * interval.step;
}

/** The interval whose duration is closest (on a log scale) to `span / count`. */
export function chooseTimeInterval(start: number, stop: number, count = 6): TimeInterval {
  const target = Math.abs(stop - start) / Math.max(1, count);
  if (!(target > 0)) return { unit: 'day', step: 1 };
  if (target > YEAR) {
    const years = Math.max(1, tickStep(0, target / YEAR, 1));
    return { unit: 'year', step: Math.round(years) || 1 };
  }
  let best = INTERVALS[0] as TimeInterval;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of INTERVALS) {
    const distance = Math.abs(Math.log(intervalMs(candidate) / target));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export interface TimeFloorOptions {
  /** First day of a week, 0 = Sunday … 6 = Saturday (default 1, Monday as in ISO 8601). */
  weekStartsOn?: number;
}

/** Start of the interval containing `ms` (UTC). Steps align to round values (00, 15, 30…). */
export function floorTime(
  ms: number,
  interval: TimeInterval,
  options: TimeFloorOptions = {}
): number {
  const d = new Date(ms);
  const { unit, step } = interval;
  switch (unit) {
    case 'second':
    case 'minute':
    case 'hour': {
      const size = intervalMs(interval);
      return Math.floor(ms / size) * size;
    }
    case 'day': {
      const day = Math.floor(ms / DAY);
      return Math.floor(day / step) * step * DAY;
    }
    case 'week': {
      const weekStart = options.weekStartsOn ?? 1;
      const dayStart = Math.floor(ms / DAY) * DAY;
      const back = (new Date(dayStart).getUTCDay() - weekStart + 7) % 7;
      return dayStart - back * DAY;
    }
    case 'month': {
      const month = Math.floor(d.getUTCMonth() / step) * step;
      return Date.UTC(d.getUTCFullYear(), month, 1);
    }
    case 'year': {
      const year = Math.floor(d.getUTCFullYear() / step) * step;
      return Date.UTC(year, 0, 1);
    }
  }
}

/** The boundary `count` intervals after the aligned boundary `ms`. */
export function offsetTime(ms: number, interval: TimeInterval, count = 1): number {
  const { unit, step } = interval;
  if (unit === 'month' || unit === 'year') {
    const d = new Date(ms);
    const months = unit === 'month' ? step * count : 0;
    const years = unit === 'year' ? step * count : 0;
    return Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth() + months, d.getUTCDate());
  }
  return ms + intervalMs(interval) * count;
}

const MAX_TIME_TICKS = 1000;

/** Aligned UTC boundaries inside `[start, stop]` (either order). */
export function timeTicks(
  start: number,
  stop: number,
  interval: TimeInterval = chooseTimeInterval(start, stop),
  options: TimeFloorOptions = {}
): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return [];
  const reverse = stop < start;
  const lo = reverse ? stop : start;
  const hi = reverse ? start : stop;
  const values: number[] = [];
  let t = floorTime(lo, interval, options);
  if (t < lo) t = offsetTime(t, interval);
  while (t <= hi && values.length < MAX_TIME_TICKS) {
    values.push(t);
    t = offsetTime(t, interval);
  }
  return reverse ? values.reverse() : values;
}

export interface TimeScale extends ContinuousScale {
  /** Interval chosen for `count` ticks, for formatting (`formatTimeTick`). */
  tickInterval(count?: number): TimeInterval;
}

export interface TimeScaleOptions extends TimeFloorOptions {
  /** Epoch milliseconds. */
  domain: Extent;
  range: Extent;
  /** Round the domain out to whole intervals for `nice` ticks (true = 6). */
  nice?: boolean | number;
  clamp?: boolean;
}

export function timeScale(options: TimeScaleOptions): TimeScale {
  const floorOptions: TimeFloorOptions = { weekStartsOn: options.weekStartsOn ?? 1 };
  let [d0, d1] = options.domain;
  const niceCount = options.nice === true ? 6 : typeof options.nice === 'number' ? options.nice : 0;
  if (niceCount > 0 && d0 !== d1) {
    const reverse = d1 < d0;
    const lo = Math.min(d0, d1);
    const hi = Math.max(d0, d1);
    const interval = chooseTimeInterval(lo, hi, niceCount);
    const niceLo = floorTime(lo, interval, floorOptions);
    let niceHi = floorTime(hi, interval, floorOptions);
    if (niceHi < hi) niceHi = offsetTime(niceHi, interval);
    [d0, d1] = reverse ? [niceHi, niceLo] : [niceLo, niceHi];
  }
  const base = linearScale({
    domain: [d0, d1],
    range: options.range,
    clamp: options.clamp ?? false,
  });
  const tickInterval = (count = 6) => chooseTimeInterval(d0, d1, count);
  return Object.assign((value: number) => base(value), {
    invert: base.invert,
    ticks: (count = 6) => timeTicks(d0, d1, tickInterval(count), floorOptions),
    tickInterval,
    domain: base.domain,
    range: base.range,
  });
}
