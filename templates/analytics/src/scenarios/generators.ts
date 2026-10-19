import {
  analyticsScenarioOptions,
  generateProductEvents,
  isoString,
  liveCounterEvents,
} from '@protoyard/analytics/generators';
import {
  type DomainEvent,
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  MS_PER_MINUTE,
  type Organization,
  type Persona,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import type {
  LiveCounterRow,
  SavedDashboard,
  TrackedEvent,
  TrackedUser,
} from '../database/schema.ts';
import { LIVE_COUNTER } from '../domain/catalog.ts';
import type { AnalyticsGeneratorOptions } from './index.ts';
import { DEFAULT_LAYOUT, defaultSegments } from './seeds.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` (seeded,
 * forked per stream) and every date from `ctx.time` / the scenario reference
 * time, so the same scenario renders the same world on every machine.
 * Order: people → tracked users and events → traffic shape → dashboards,
 * segments and counters.
 */

/** Bump when the same seed would produce a different world. */
export const ANALYTICS_TEMPLATE_GENERATOR_VERSION = 1;

/** Fixed people, so links like `?actor=user_0004` always mean the same person. */
const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Amara Osei',
    title: 'Head of product',
    role: 'owner',
    color: '#7c3aed',
  },
  { id: 'user_0002', name: 'Jonas Weber', title: 'Data lead', role: 'admin', color: '#0891b2' },
  {
    id: 'user_0003',
    name: 'Lucía Romero',
    title: 'Growth analyst',
    role: 'member',
    color: '#059669',
  },
  {
    id: 'user_0004',
    name: 'Kenji Mori',
    title: 'Board observer (read-only)',
    role: 'viewer',
    color: '#d97706',
  },
] as const;

const PROPERTIES = {
  plan: [
    ['free', 6],
    ['pro', 3],
    ['team', 1],
  ],
  country: [
    ['NZ', 1],
    ['CA', 2],
    ['DE', 2],
    ['BR', 1.5],
    ['JP', 1],
    ['KE', 0.5],
  ],
  platform: [
    ['web', 6],
    ['ios', 2.5],
    ['android', 1.5],
  ],
} as const;

const SESSION_EVENTS = { page_view: 6, feature_used: 3, report_exported: 0.6 };

/** Activation journey after signup: [event type, chance from the previous step, median minutes]. */
const JOURNEY = [
  ['project_created', 0.62, 45],
  ['invite_sent', 0.48, 600],
  ['upgraded', 0.34, 2880],
] as const;

function options(ctx: GenerateContext): AnalyticsGeneratorOptions {
  const raw = (ctx.scenario.generators.analytics ?? {}) as Partial<AnalyticsGeneratorOptions>;
  return { users: Math.max(0, Math.floor(raw.users ?? 80)) };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const subscription = scenario.organization.subscription;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Labs',
    type: 'company',
    plan: subscription === 'trial' || subscription === 'expired' ? 'pro' : subscription,
    billingStatus:
      subscription === 'expired' ? 'expired' : subscription === 'trial' ? 'trialing' : 'active',
    createdAt: time.iso(time.daysAgo(ageDays)),
    size: PEOPLE.length,
    featureFlags: { ...scenario.organization.featureFlags },
  };
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  PEOPLE.forEach((p, index) => {
    const days =
      p.id === scenario.actor.id
        ? Math.min(ageDays, scenario.actor.joinedDaysAgo)
        : index === 0
          ? ageDays
          : Math.round(ageDays * (1 - index / (PEOPLE.length + 1)));
    const joinedAt = time.iso(time.daysAgo(days));
    const role = p.id === scenario.actor.id ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
      title: p.title,
      avatarColor: p.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${p.title} · ${role}, joined ${days === 0 ? 'today' : `${days} days ago`}`,
    });
    memberships.push({
      id: `membership_${String(index + 1).padStart(4, '0')}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  });
  return { organization, personas, memberships };
}

/** Merges time-sorted event lists (ISO `at` strings sort by time) without re-sorting everything. */
function mergeByTime(lists: TrackedEvent[][]): TrackedEvent[] {
  return lists.reduce((a, b) => {
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    const out: TrackedEvent[] = new Array(a.length + b.length);
    let i = 0;
    let j = 0;
    let k = 0;
    while (i < a.length && j < b.length) {
      out[k++] =
        (b[j] as TrackedEvent).at < (a[i] as TrackedEvent).at
          ? (b[j++] as TrackedEvent)
          : (a[i++] as TrackedEvent);
    }
    while (i < a.length) out[k++] = a[i++] as TrackedEvent;
    while (j < b.length) out[k++] = b[j++] as TrackedEvent;
    return out;
  }, []);
}

/** Tracked users with sessions, an ordered activation journey each, and the scenario's traffic shape. */
export function trackedWorld(ctx: GenerateContext): {
  users: TrackedUser[];
  events: TrackedEvent[];
} {
  const ref = Date.parse(ctx.scenario.referenceTime);
  const shape = analyticsScenarioOptions(ctx);
  const base = options(ctx).users;
  const main = generateProductEvents(ctx, {
    users: base,
    eventTypes: SESSION_EVENTS,
    firstEvent: 'signup',
    properties: PROPERTIES,
    sessionsPerUser: { mean: 5 },
  });
  const users = main.users;
  const streams: TrackedEvent[][] = [main.events];
  // A launch brings an extra wave of signups in the days after it.
  for (const [i, spike] of shape.spikes.entries()) {
    const daysAgo = Math.max(1, Math.ceil((ref - Date.parse(String(spike.at))) / MS_PER_DAY));
    const wave = generateProductEvents(ctx, {
      users: Math.round(base * (spike.factor - 1) * 0.5),
      days: daysAgo,
      eventTypes: SESSION_EVENTS,
      firstEvent: 'signup',
      properties: PROPERTIES,
      sessionsPerUser: { mean: 2 },
      key: `launch:${i}`,
    });
    users.push(...wave.users);
    streams.push(wave.events);
  }

  // Activation steps follow each signup in time; only these few events need sorting.
  const rng = ctx.rng.fork('analytics:journeys');
  const steps: { at: number; type: string; user: TrackedUser }[] = [];
  for (const user of users) {
    let at = Date.parse(user.createdAt);
    for (const [type, chance, minutes] of JOURNEY) {
      if (!rng.chance(chance)) break;
      at += Math.max(
        MS_PER_MINUTE,
        Math.round(minutes * MS_PER_MINUTE * Math.exp(0.8 * (rng.next() * 2 - 1)))
      );
      if (at >= ref) break;
      steps.push({ at, type, user });
    }
  }
  steps.sort((a, b) => a.at - b.at);
  streams.push(
    steps.map((s) => ({
      id: ctx.ids.next('evt'),
      type: s.type,
      userId: s.user.id,
      at: isoString(s.at),
      properties: s.user.properties,
    }))
  );
  let events = mergeByTime(streams);

  // An outage loses most events inside its window (signups stay: accounts still get created).
  if (shape.outages.length > 0) {
    const windows = shape.outages.map((o) => {
      const start = Math.floor((ref - o.daysAgo * MS_PER_DAY) / MS_PER_DAY) * MS_PER_DAY;
      return {
        from: isoString(start),
        to: isoString(start + (o.days ?? 1) * MS_PER_DAY),
        keep: o.depth ?? 0.15,
      };
    });
    const thin = ctx.rng.fork('analytics:outages');
    events = events.filter((e) => {
      const hit = windows.find((w) => e.at >= w.from && e.at < w.to);
      return !hit || e.type === 'signup' || thin.next() < hit.keep;
    });
  }
  return { users, events };
}

export function generateAnalyticsWorld(ctx: GenerateContext): WorldSeed {
  const { organization, personas, memberships } = identities(ctx);
  const { users, events } = trackedWorld(ctx);
  const created = organization.createdAt;
  const dashboards: SavedDashboard[] = [
    {
      id: 'dashboard_overview',
      name: 'Product overview',
      layout: DEFAULT_LAYOUT,
      ownerId: 'user_0001',
      createdAt: created,
      updatedAt: created,
    },
  ];
  const segments = users.length > 0 ? defaultSegments(created) : [];
  // Active users in the last 24 hours seed the live counter; the timeline moves it from there.
  const ref = Date.parse(ctx.scenario.referenceTime);
  const since = isoString(ref - MS_PER_DAY);
  const recent = new Set<string>();
  // Events are sorted: walk back from the newest until the 24-hour mark.
  for (let i = events.length - 1; i >= 0 && (events[i] as TrackedEvent).at > since; i--)
    recent.add((events[i] as TrackedEvent).userId);
  const counters: LiveCounterRow[] = [
    { id: LIVE_COUNTER, value: recent.size, updatedAt: ctx.scenario.referenceTime },
  ];
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { users, events, dashboards, segments, counters, activity: [] },
  };
}

/** Deterministic counter bumps for simulated time (`scenarios.advance()`): a busy product keeps moving. */
export function analyticsTimeline(ctx: TimelineContext): DomainEvent[] {
  const users = options(ctx).users;
  if (ctx.scenario.density === 'empty' || users === 0) return [];
  return liveCounterEvents(
    { scenario: ctx.scenario, from: ctx.from, to: ctx.to },
    { counter: LIVE_COUNTER, perDay: ctx.scale(users) * 2, hours: [7, 22] }
  );
}
