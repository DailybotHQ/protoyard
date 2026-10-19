import type { Rng } from '@protoyard/core';

/** Standard normal sample (Box–Muller) from the scenario rng. */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng.next(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/**
 * Power-law (Pareto) count with the given mean: most users do little, a few do
 * a lot. `alpha` > 1 sets the tail (smaller = heavier). Capped at `max`.
 */
export function paretoCount(rng: Rng, mean: number, alpha = 1.4, max = 200): number {
  if (!(mean > 0)) return 0;
  const a = Math.max(1.05, alpha);
  const xm = (mean * (a - 1)) / a;
  const u = Math.max(rng.next(), Number.EPSILON);
  return Math.min(max, Math.max(1, Math.round(xm / u ** (1 / a))));
}

/** Weekday weights, Sunday first (matches `timeSeries` weekly seasonality in @protoyard/scenarios). */
export const WEEKDAY_WEIGHT = [0.55, 1.05, 1.1, 1.12, 1.08, 0.98, 0.6] as const;
const MAX_WEEKDAY_WEIGHT = 1.12;

/**
 * A random instant in `[from, to)`, thinned by weekday weights when `weekly`
 * is on (quiet weekends). Bounded retries keep it fast and deterministic.
 */
export function instantBetween(rng: Rng, from: number, to: number, weekly: boolean): number {
  const span = Math.max(1, to - from);
  for (let attempt = 0; attempt < 8; attempt++) {
    const t = from + Math.floor(rng.next() * span);
    if (
      !weekly ||
      rng.next() * MAX_WEEKDAY_WEIGHT <= (WEEKDAY_WEIGHT[new Date(t).getUTCDay()] as number)
    )
      return t;
  }
  return from + Math.floor(rng.next() * span);
}

/** Picks a value from `[[value, weight], …]`. */
export function weightedPick<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  return rng.weighted(entries);
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const TWO = Array.from({ length: 100 }, (_, i) => pad(i, 2));
const THREE = Array.from({ length: 1000 }, (_, i) => pad(i, 3));
/** `YYYY-MM-DDT` per UTC day number: generated events cluster on a few hundred days. */
const dayPrefix = new Map<number, string>();

function datePrefix(day: number): string {
  let prefix = dayPrefix.get(day);
  if (prefix !== undefined) return prefix;
  const z = day + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const date = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  prefix = `${pad(year, 4)}-${TWO[month]}-${TWO[date]}T`;
  if (dayPrefix.size > 20_000) dayPrefix.clear();
  dayPrefix.set(day, prefix);
  return prefix;
}

/**
 * `new Date(ms).toISOString()` by arithmetic (Hinnant's civil-from-days, with
 * the date part cached per day). Generators format tens of thousands of
 * instants and `toISOString` can cost microseconds each; this matches it
 * exactly for every UTC instant from year 0000 to 9999.
 */
export function isoString(ms: number): string {
  const day = Math.floor(ms / 86_400_000);
  const rest = ms - day * 86_400_000;
  return `${datePrefix(day)}${TWO[Math.floor(rest / 3_600_000)]}:${TWO[Math.floor(rest / 60_000) % 60]}:${
    TWO[Math.floor(rest / 1000) % 60]
  }.${THREE[rest % 1000]}Z`;
}
