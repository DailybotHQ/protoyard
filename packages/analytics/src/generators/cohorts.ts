import { type GenerateContext, MS_PER_DAY } from '@protoyard/core';
import { bucketStart, nextBucket } from '../bucket.ts';
import type { RetentionInterval } from '../cohort.ts';
import type { AnalyticsEvent } from '../schema.ts';
import { instantBetween, isoString } from './random.ts';

export interface GenerateCohortsOptions {
  /** Cohorts ending at the current one (default 8). */
  cohorts?: number;
  interval?: RetentionInterval;
  /** Users per cohort at normal density (scaled by `ctx.scale`; ±20 % per cohort). Default 120. */
  cohortSize?: number;
  /**
   * Chance a user returns in period N ≥ 1: an explicit list, or a curve
   * `{ initial, decay }` giving `initial × decay^(N−1)`. Default `{ initial: 0.45, decay: 0.8 }`.
   */
  retention?: readonly number[] | { initial: number; decay: number };
  signupEvent?: string;
  returnEvent?: string;
  key?: string;
}

/** Signups per cohort and return visits that follow a retention curve: input for `computeRetention`. */
export function generateCohorts(
  ctx: GenerateContext,
  options: GenerateCohortsOptions = {}
): AnalyticsEvent[] {
  const rng = ctx.rng.fork(`analytics:${options.key ?? 'cohorts'}`);
  const interval = options.interval ?? 'week';
  const ref = Date.parse(ctx.scenario.referenceTime);
  const count = Math.max(1, options.cohorts ?? 8);
  const curve = options.retention ?? { initial: 0.45, decay: 0.8 };
  const rateAt = (p: number) =>
    Array.isArray(curve)
      ? (curve[p - 1] ?? 0)
      : (curve as { initial: number; decay: number }).initial *
        (curve as { decay: number }).decay ** (p - 1);
  const signup = options.signupEvent ?? 'signup';
  const back = options.returnEvent ?? 'session_start';

  // Cohort starts, oldest first, ending with the bucket that holds the reference time.
  const starts: number[] = [bucketStart(ref, interval)];
  while (starts.length < count) {
    const previous = bucketStart((starts[0] as number) - MS_PER_DAY, interval);
    starts.unshift(previous);
  }
  const out: { at: number; event: Omit<AnalyticsEvent, 'id'> }[] = [];
  for (const start of starts) {
    const size = Math.round(ctx.scale(options.cohortSize ?? 120) * (0.8 + 0.4 * rng.next()));
    const end = Math.min(nextBucket(start, interval), ref);
    for (let u = 0; u < size; u++) {
      const userId = ctx.ids.next('usr');
      out.push({
        at: instantBetween(rng, start, end, false),
        event: { type: signup, userId, at: '', properties: {} },
      });
      let periodStart = nextBucket(start, interval);
      for (let p = 1; periodStart < ref; p++) {
        const periodEnd = Math.min(nextBucket(periodStart, interval), ref);
        if (rng.chance(Math.min(1, Math.max(0, rateAt(p))))) {
          out.push({
            at: instantBetween(rng, periodStart, periodEnd, false),
            event: { type: back, userId, at: '', properties: {} },
          });
        }
        periodStart = nextBucket(periodStart, interval);
      }
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out.map(({ at, event }) => ({
    ...event,
    id: ctx.ids.next('evt'),
    at: isoString(at),
  }));
}
