import { z } from 'zod';
import { readProperty } from './filter.ts';

/** One ordered funnel step, matched by event type. */
export const FunnelStepSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1).max(60),
  eventType: z.string().min(1),
});
export type FunnelStep = z.infer<typeof FunnelStepSchema>;

/** A funnel needs at least two steps and unique step ids. */
export const FunnelDefinitionSchema = z
  .array(FunnelStepSchema)
  .min(2, 'A funnel needs at least two steps')
  .max(12)
  .refine((steps) => new Set(steps.map((s) => s.id)).size === steps.length, {
    message: 'Funnel step ids must be unique',
  });
export type FunnelDefinition = z.infer<typeof FunnelDefinitionSchema>;

/** The event fields funnels and cohorts read; `AnalyticsEvent` rows fit as they are. */
export interface FunnelEvent {
  type: string;
  userId: string;
  /** Epoch ms or an ISO instant. */
  at: number | string;
  properties?: Readonly<Record<string, unknown>>;
}

export interface ComputeFunnelOptions {
  /** Time allowed from a user's first step to each later step, in ms (default: unlimited). */
  window?: number;
  /** A property path on the first-step event (`properties.plan`) to split the funnel by. */
  breakdown?: string;
  /** Only events in `[start, end)` count. */
  range?: { start: number; end: number };
}

export interface FunnelStepResult {
  id: string;
  label: string;
  /** Users who reached this step (in order, within the window). */
  count: number;
  /** count / first step's count; null when nobody entered. */
  conversion: number | null;
  /** count / previous step's count (1 for the first step); null when the previous step is 0. */
  stepConversion: number | null;
  /** Users lost since the previous step. */
  dropOff: number;
  /** Median ms from the previous step to this one; null for the first step or when nobody converted. */
  medianTimeToConvert: number | null;
}

export interface FunnelResult {
  steps: FunnelStepResult[];
  /** Present with `breakdown`: one funnel per value of the property, largest first. */
  breakdown?: { key: string; steps: FunnelStepResult[] }[];
}

/** Label for users whose first-step event lacks the breakdown property. */
export const NO_VALUE = '(none)';

const time = (at: number | string) => (typeof at === 'number' ? at : Date.parse(at));

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Group events by user once, sorted by time (ties keep input order). */
export function eventsByUser<E extends FunnelEvent>(
  events: Iterable<E>,
  range?: { start: number; end: number }
): Map<string, { at: number; event: E }[]> {
  const users = new Map<string, { at: number; event: E }[]>();
  for (const event of events) {
    const at = time(event.at);
    if (!Number.isFinite(at)) continue;
    if (range && (at < range.start || at >= range.end)) continue;
    let list = users.get(event.userId);
    if (!list) {
      list = [];
      users.set(event.userId, list);
    }
    list.push({ at, event });
  }
  for (const list of users.values()) list.sort((a, b) => a.at - b.at);
  return users;
}

function summarise(
  steps: readonly FunnelStep[],
  counts: number[],
  durations: number[][]
): FunnelStepResult[] {
  const first = counts[0] ?? 0;
  return steps.map((step, i) => {
    const count = counts[i] as number;
    const previous = i === 0 ? count : (counts[i - 1] as number);
    return {
      id: step.id,
      label: step.label,
      count,
      conversion: first > 0 ? count / first : null,
      stepConversion: i === 0 ? 1 : previous > 0 ? count / previous : null,
      dropOff: i === 0 ? 0 : previous - count,
      medianTimeToConvert: i === 0 ? null : median(durations[i] as number[]),
    };
  });
}

/**
 * Ordered funnel: a user enters at their earliest first-step event, then
 * each later step must happen after the previous one (a later event) and
 * within `window` of entering. Each user is grouped and walked once:
 * O(n log n) for the per-user sort, then linear.
 */
export function computeFunnel<E extends FunnelEvent>(
  events: Iterable<E>,
  steps: readonly FunnelStep[],
  options: ComputeFunnelOptions = {}
): FunnelResult {
  const window = options.window ?? Number.POSITIVE_INFINITY;
  const n = steps.length;
  const fresh = () => ({
    counts: new Array<number>(n).fill(0),
    durations: steps.map(() => [] as number[]),
  });
  const total = fresh();
  const groups = new Map<string, ReturnType<typeof fresh>>();

  for (const list of eventsByUser(events, options.range).values()) {
    const entry = list.findIndex((e) => e.event.type === steps[0]?.eventType);
    if (entry < 0) continue;
    const start = (list[entry] as { at: number }).at;
    const key = options.breakdown
      ? (() => {
          const v = readProperty(list[entry]?.event, options.breakdown);
          return v === undefined || v === null || v === '' ? NO_VALUE : String(v);
        })()
      : '';
    let group = groups.get(key);
    if (options.breakdown && !group) {
      group = fresh();
      groups.set(key, group);
    }
    const targets = group ? [total, group] : [total];
    for (const t of targets) (t.counts[0] as number)++;
    let cursor = entry;
    let previousAt = start;
    for (let s = 1; s < n; s++) {
      const wanted = (steps[s] as FunnelStep).eventType;
      let found = -1;
      for (let i = cursor + 1; i < list.length; i++) {
        const e = list[i] as { at: number; event: E };
        if (e.at - start > window) break;
        if (e.event.type === wanted) {
          found = i;
          break;
        }
      }
      if (found < 0) break;
      const at = (list[found] as { at: number }).at;
      for (const t of targets) {
        (t.counts[s] as number)++;
        (t.durations[s] as number[]).push(at - previousAt);
      }
      cursor = found;
      previousAt = at;
    }
  }

  const result: FunnelResult = { steps: summarise(steps, total.counts, total.durations) };
  if (options.breakdown) {
    result.breakdown = [...groups.entries()]
      .map(([key, g]) => ({ key, steps: summarise(steps, g.counts, g.durations) }))
      .sort(
        (a, b) => (b.steps[0]?.count ?? 0) - (a.steps[0]?.count ?? 0) || a.key.localeCompare(b.key)
      );
  }
  return result;
}
