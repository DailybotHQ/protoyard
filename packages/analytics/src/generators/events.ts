import { type GenerateContext, MS_PER_DAY, MS_PER_MINUTE, type Rng } from '@protoyard/core';
import type { AnalyticsEvent, EventPropertyValue } from '../schema.ts';
import { analyticsScenarioOptions } from './options.ts';
import { gaussian, instantBetween, isoString, paretoCount, weightedPick } from './random.ts';

/** Weighted values for a user property: `{ plan: [['free', 6], ['pro', 3], ['team', 1]] }`. */
export type PropertyWeights = Readonly<
  Record<string, readonly (readonly [EventPropertyValue, number])[]>
>;

export interface AnalyticsUser {
  id: string;
  /** ISO instant of the first event. */
  createdAt: string;
  properties: Record<string, EventPropertyValue>;
}

export interface GenerateProductEventsOptions {
  /** Users at normal density (scaled by `ctx.scale`; 0 when the scenario is empty). Default 2,000. */
  users?: number;
  /** Days of history (default the scenario history). */
  days?: number;
  /** Event types inside a session, by weight: `{ page_view: 6, feature_used: 3, export: 1 }`. */
  eventTypes: Readonly<Record<string, number>>;
  /** The first event of every user (e.g. `signup`); omit to start with a session event. */
  firstEvent?: string;
  /** Mean sessions per user; the distribution is a power law (default 4, alpha 1.4). */
  sessionsPerUser?: { mean: number; alpha?: number; max?: number };
  /** Events per session, uniform 1…max (default 4). */
  maxEventsPerSession?: number;
  /** User properties copied onto every event (for breakdowns and filters). */
  properties?: PropertyWeights;
  /** Stream label so two calls in one generator stay independent (default `'events'`). */
  key?: string;
}

const pick = (rng: Rng, weights: PropertyWeights) => {
  const out: Record<string, EventPropertyValue> = {};
  for (const [name, entries] of Object.entries(weights)) out[name] = weightedPick(rng, entries);
  return out;
};

/**
 * Users and their product events: power-law sessions per user (a few power
 * users, a long tail of light ones), quiet weekends when the scenario is
 * weekly, user properties on every event. Sorted by time; ids from `ctx.ids`.
 */
export function generateProductEvents(
  ctx: GenerateContext,
  options: GenerateProductEventsOptions
): { users: AnalyticsUser[]; events: AnalyticsEvent[] } {
  const scenario = analyticsScenarioOptions(ctx);
  const rng = ctx.rng.fork(`analytics:${options.key ?? 'events'}`);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const days = options.days ?? Math.max(1, scenario.days);
  const start = ref - days * MS_PER_DAY;
  const weekly = scenario.seasonality === 'weekly' || scenario.seasonality === 'weekly+annual';
  const types = Object.entries(options.eventTypes).filter(([, w]) => w > 0);
  if (types.length === 0)
    throw new RangeError('generateProductEvents(): eventTypes needs a positive weight');
  const userCount = ctx.scale(options.users ?? 2000);
  const sessions = options.sessionsPerUser ?? { mean: 4 };
  const maxPerSession = Math.max(1, options.maxEventsPerSession ?? 4);

  const users: AnalyticsUser[] = [];
  // Parallel arrays and one index sort: no intermediate event objects.
  const at: number[] = [];
  const type: string[] = [];
  const owner: number[] = [];
  for (let u = 0; u < userCount; u++) {
    const id = ctx.ids.next('usr');
    // More recent signups are likelier, which reads as growth.
    const createdAt = ref - Math.floor(rng.next() ** 0.75 * (ref - start));
    users.push({
      id,
      createdAt: isoString(createdAt),
      properties: pick(rng, options.properties ?? {}),
    });
    if (options.firstEvent) {
      at.push(createdAt);
      type.push(options.firstEvent);
      owner.push(u);
    }
    const n = paretoCount(rng, sessions.mean, sessions.alpha, sessions.max);
    for (let s = 0; s < n; s++) {
      let t = instantBetween(rng, createdAt, ref, weekly);
      const count = rng.int(1, maxPerSession);
      for (let e = 0; e < count; e++) {
        at.push(t);
        type.push(weightedPick(rng, types));
        owner.push(u);
        // Lognormal gaps around two minutes inside a session.
        t = Math.min(ref - 1, t + Math.round(2 * MS_PER_MINUTE * Math.exp(0.8 * gaussian(rng))));
      }
    }
  }
  const order = Array.from(at.keys()).sort(
    (a, b) => (at[a] as number) - (at[b] as number) || a - b
  );
  const events: AnalyticsEvent[] = new Array(order.length);
  order.forEach((i, k) => {
    const user = users[owner[i] as number] as AnalyticsUser;
    events[k] = {
      id: ctx.ids.next('evt'),
      type: type[i] as string,
      userId: user.id,
      at: isoString(at[i] as number),
      // Shared per user (read-only by convention): the user's properties at signup.
      properties: user.properties,
    };
  });
  return { users, events };
}

export interface GenerateFunnelJourneysOptions {
  /** Event types in order: `['visit', 'signup', 'activate', 'subscribe']`. */
  steps: readonly string[];
  /** Users entering (scaled by `ctx.scale`). Default 1,000. */
  users?: number;
  /** Chance of continuing from each step to the next (length = steps − 1), e.g. `[0.45, 0.6, 0.3]`. */
  conversion: readonly number[];
  /** Median minutes between consecutive steps (default 90); spread is lognormal. */
  medianStepMinutes?: number;
  days?: number;
  properties?: PropertyWeights;
  key?: string;
}

/** Ordered journeys that drop off step by step: input for `computeFunnel`. */
export function generateFunnelJourneys(
  ctx: GenerateContext,
  options: GenerateFunnelJourneysOptions
): AnalyticsEvent[] {
  const scenario = analyticsScenarioOptions(ctx);
  const rng = ctx.rng.fork(`analytics:${options.key ?? 'funnel'}`);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const days = options.days ?? Math.max(1, scenario.days);
  const weekly = scenario.seasonality === 'weekly' || scenario.seasonality === 'weekly+annual';
  const median = (options.medianStepMinutes ?? 90) * MS_PER_MINUTE;
  const out: { at: number; event: Omit<AnalyticsEvent, 'id'> }[] = [];
  const users = ctx.scale(options.users ?? 1000);
  for (let u = 0; u < users; u++) {
    const userId = ctx.ids.next('usr');
    const properties = pick(rng, options.properties ?? {});
    let at = instantBetween(rng, ref - days * MS_PER_DAY, ref, weekly);
    for (let s = 0; s < options.steps.length; s++) {
      if (at >= ref) break;
      out.push({ at, event: { type: options.steps[s] as string, userId, at: '', properties } });
      if (s === options.steps.length - 1 || !rng.chance(options.conversion[s] ?? 0)) break;
      at += Math.max(MS_PER_MINUTE, Math.round(median * Math.exp(0.9 * gaussian(rng))));
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out.map(({ at, event }) => ({
    ...event,
    id: ctx.ids.next('evt'),
    at: isoString(at),
  }));
}
