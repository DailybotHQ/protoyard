import {
  analyticsScenarioOptions,
  generateProductEvents,
  isoString,
  liveCounterEvents,
} from '@protoyard/analytics/generators';
import {
  createRng,
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
  AlertCheck,
  Annotation,
  DailyRollup,
  LiveCounterRow,
  MetricAlert,
  Project,
  SavedDashboard,
  TrackedEvent,
  TrackedUser,
} from '../database/schema.ts';
import { LIVE_COUNTER } from '../domain/catalog.ts';
import type { PebblestatGeneratorOptions } from './index.ts';
import { DEFAULT_LAYOUT, defaultReports, defaultSegments, releaseAnnotations } from './seeds.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` forks
 * (one per stream), ids from `ctx.ids`, dates from the scenario reference
 * time, so the same scenario renders the same world on every machine.
 * Order: people → projects → tracked users and events per project → traffic
 * shape (launch wave, outage, churn) → rollups → saved objects → alerts.
 */

/** Bump when the same seed would produce a different world. */
export const PEBBLESTAT_GENERATOR_VERSION = 1;

/** Fixed people, so links like `?actor=user_0003` always mean the same person. */
const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Maya Okafor',
    title: 'Head of product',
    role: 'owner',
    color: '#7c3aed',
  },
  {
    id: 'user_0002',
    name: 'Theo Lindqvist',
    title: 'Product analyst',
    role: 'analyst',
    color: '#0891b2',
  },
  {
    id: 'user_0003',
    name: 'Inês Duarte',
    title: 'Investor (read-only)',
    role: 'viewer',
    color: '#d97706',
  },
] as const;

/** Two tracked products. Mobile has about a third of Web's users. */
const PROJECTS = [
  { id: 'proj_web', name: 'Pebblestat Web', platform: 'web', share: 1, platforms: [['web', 1]] },
  {
    id: 'proj_mobile',
    name: 'Pebblestat Mobile',
    platform: 'mobile',
    share: 0.35,
    platforms: [
      ['ios', 6],
      ['android', 4],
    ],
  },
] as const;

const PLAN_WEIGHTS = [
  ['free', 6],
  ['pro', 3],
  ['team', 1],
] as const;
const COUNTRY_WEIGHTS = [
  ['NZ', 1],
  ['CA', 2],
  ['DE', 2],
  ['BR', 1.5],
  ['JP', 1],
  ['KE', 0.5],
] as const;

const SESSION_EVENTS = { page_view: 6, feature_used: 3, report_exported: 0.6 };

/** Activation journey after signup: [event type, chance from the previous step, median minutes]. */
const JOURNEY = [
  ['project_created', 0.62, 45],
  ['invite_sent', 0.48, 600],
  ['upgraded', 0.34, 2880],
] as const;

export function generatorOptions(
  ctx: Pick<GenerateContext, 'scenario'>
): PebblestatGeneratorOptions {
  const raw = (ctx.scenario.generators.pebblestat ?? {}) as Partial<PebblestatGeneratorOptions>;
  const rate =
    typeof raw.sampleRate === 'number' && raw.sampleRate > 0 && raw.sampleRate <= 1
      ? raw.sampleRate
      : 1;
  return {
    users: Math.max(0, Math.floor(raw.users ?? 80)),
    ...(raw.churn ? { churn: raw.churn } : {}),
    sampleRate: rate,
  };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const subscription = scenario.organization.subscription;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Pebblestat',
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
    // The scenario decides the actor's role; the others keep their fixed role.
    const role = p.id === scenario.actor.id ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      email: `${p.name
        .split(' ')[0]
        ?.toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z]/g, '')}@example.com`,
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

type ProjectSpec = (typeof PROJECTS)[number];

/** One project's users and events: sessions, a launch wave, activation journeys, outage and churn. */
function projectTraffic(
  ctx: GenerateContext,
  project: ProjectSpec,
  opts: PebblestatGeneratorOptions
): { users: TrackedUser[]; events: TrackedEvent[] } {
  const ref = Date.parse(ctx.scenario.referenceTime);
  const shape = analyticsScenarioOptions(ctx);
  // A sampled scenario's `users` counts Web's sample; Mobile keeps the normal-density size.
  const base = Math.round(
    (project.id === 'proj_web' || (opts.sampleRate ?? 1) === 1 ? opts.users : 80) * project.share
  );
  const properties = { plan: PLAN_WEIGHTS, country: COUNTRY_WEIGHTS, platform: project.platforms };
  const tag = (list: { id: string; createdAt: string; properties: TrackedUser['properties'] }[]) =>
    list.map((u) => ({ ...u, projectId: project.id }));
  const withProject = (list: Omit<TrackedEvent, 'projectId'>[]) =>
    list.map((e) => ({ ...e, projectId: project.id }) as TrackedEvent);

  const main = generateProductEvents(ctx, {
    users: base,
    eventTypes: SESSION_EVENTS,
    firstEvent: 'signup',
    properties,
    sessionsPerUser: { mean: 5 },
    key: project.id,
  });
  const users = tag(main.users);
  const streams: TrackedEvent[][] = [withProject(main.events)];
  // A launch brings an extra wave of signups in the days after it.
  for (const [i, spike] of shape.spikes.entries()) {
    const daysAgo = Math.max(1, Math.ceil((ref - Date.parse(String(spike.at))) / MS_PER_DAY));
    const wave = generateProductEvents(ctx, {
      users: Math.round(base * (spike.factor - 1) * 0.5),
      days: daysAgo,
      eventTypes: SESSION_EVENTS,
      firstEvent: 'signup',
      properties,
      sessionsPerUser: { mean: 2 },
      key: `${project.id}:launch:${i}`,
    });
    users.push(...tag(wave.users));
    streams.push(withProject(wave.events));
  }

  // Activation steps follow each signup in time; only these few events need sorting.
  const rng = ctx.rng.fork(`journeys:${project.id}`);
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
      projectId: project.id,
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
    const thin = ctx.rng.fork(`outages:${project.id}`);
    events = events.filter((e) => {
      const hit = windows.find((w) => e.at >= w.from && e.at < w.to);
      return !hit || e.type === 'signup' || thin.next() < hit.keep;
    });
  }

  // A churn-risk cohort: of the users who signed up in the window, all but `keep` go silent after their first week.
  if (opts.churn) {
    const { fromDaysAgo, toDaysAgo, keep } = opts.churn;
    const from = isoString(ref - fromDaysAgo * MS_PER_DAY);
    const to = isoString(ref - toDaysAgo * MS_PER_DAY);
    const pick = ctx.rng.fork(`churn:${project.id}`);
    const quietAfter = new Map<string, string>();
    for (const u of users) {
      if (u.createdAt >= from && u.createdAt < to && !pick.chance(keep)) {
        quietAfter.set(u.id, isoString(Date.parse(u.createdAt) + 7 * MS_PER_DAY));
      }
    }
    events = events.filter((e) => {
      const after = quietAfter.get(e.userId);
      return after === undefined || e.at < after;
    });
  }
  return { users, events };
}

/**
 * Full-stream daily counts per type for a sampled project. Each sampled event
 * stands for 1 / rate events; a small seeded jitter (±3 %) keeps the totals
 * from all being exact multiples of 1 / rate, as real pre-aggregated counts are.
 */
function rollupsOf(
  ctx: GenerateContext,
  projectId: string,
  events: readonly TrackedEvent[],
  rate: number
): DailyRollup[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = `${e.at.slice(0, 10)}|${e.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const jitter = ctx.rng.fork(`rollups:${projectId}`);
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, n]) => {
      const [day, type] = key.split('|') as [string, string];
      const count = Math.round((n / rate) * (0.97 + 0.06 * jitter.next()));
      return { id: `rollup_${projectId}_${day}_${type}`, projectId, day, type, count };
    });
}

/** Daily counts of one type for the `days` days before the reference day (oldest first). */
function dailyCounts(
  events: readonly TrackedEvent[],
  type: string,
  ref: number,
  days: number,
  scale: number
) {
  const end = Math.floor(ref / MS_PER_DAY) * MS_PER_DAY;
  const out = Array.from({ length: days }, (_, i) => ({
    day: isoString(end - (days - i) * MS_PER_DAY).slice(0, 10),
    count: 0,
  }));
  const index = new Map(out.map((d, i) => [d.day, i]));
  for (const e of events) {
    if (e.type !== type) continue;
    const i = index.get(e.at.slice(0, 10));
    if (i !== undefined) (out[i] as { count: number }).count++;
  }
  return out.map((d) => ({ ...d, count: Math.round(d.count / scale) }));
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** Seeded alerts on the Web project, with 14 days of checks from the actual daily counts. */
function seededAlerts(
  projectId: string,
  events: readonly TrackedEvent[],
  ref: number,
  rate: number,
  created: string
): { alerts: MetricAlert[]; checks: AlertCheck[] } {
  const specs = [
    {
      id: `alert_pageviews_${projectId}`,
      name: 'Page views dropped',
      eventType: 'page_view',
      operator: 'below' as const,
      factor: 0.5,
      ownerId: 'user_0001',
    },
    {
      id: `alert_exports_${projectId}`,
      name: 'Export surge',
      eventType: 'report_exported',
      operator: 'above' as const,
      factor: 2.5,
      ownerId: 'user_0002',
    },
  ];
  const alerts: MetricAlert[] = [];
  const checks: AlertCheck[] = [];
  for (const spec of specs) {
    const daily = dailyCounts(events, spec.eventType, ref, 14, rate);
    const baseline = median(daily.map((d) => d.count));
    const threshold = Math.max(1, Math.round(baseline * spec.factor));
    let lastFiredAt: string | null = null;
    for (const d of daily) {
      const at = `${d.day}T09:00:00.000Z`;
      const fired = spec.operator === 'below' ? d.count < threshold : d.count > threshold;
      if (fired) lastFiredAt = at;
      checks.push({
        id: `check_${spec.id}_${d.day}`,
        alertId: spec.id,
        projectId,
        at,
        value: d.count,
        fired,
      });
    }
    const last = checks.at(-1) as AlertCheck;
    alerts.push({
      id: spec.id,
      projectId,
      name: spec.name,
      eventType: spec.eventType,
      operator: spec.operator,
      threshold,
      baseline,
      muted: false,
      status: last.fired ? 'firing' : 'ok',
      lastValue: last.value,
      lastCheckedAt: last.at,
      lastFiredAt,
      ownerId: spec.ownerId,
      createdAt: created,
      updatedAt: created,
    });
  }
  return { alerts, checks };
}

export function generatePebblestatWorld(ctx: GenerateContext): WorldSeed {
  const { organization, personas, memberships } = identities(ctx);
  const opts = generatorOptions(ctx);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const shape = analyticsScenarioOptions(ctx);
  const created = organization.createdAt;
  const rate = opts.sampleRate ?? 1;

  const projects: Project[] = [];
  const users: TrackedUser[] = [];
  const streams: TrackedEvent[][] = [];
  const rollups: DailyRollup[] = [];
  const traffic = new Map<string, TrackedEvent[]>();
  for (const spec of PROJECTS) {
    // Only Web is sampled at enterprise scale; Mobile stays raw.
    const sampleRate = spec.id === 'proj_web' ? rate : 1;
    projects.push({
      id: spec.id,
      name: spec.name,
      platform: spec.platform,
      createdAt: created,
      sampleRate,
    });
    const t = projectTraffic(ctx, spec, opts);
    users.push(...t.users);
    streams.push(t.events);
    traffic.set(spec.id, t.events);
    if (sampleRate < 1) rollups.push(...rollupsOf(ctx, spec.id, t.events, sampleRate));
  }
  const events = mergeByTime(streams);
  const hasData = users.length > 0;

  const dashboards: SavedDashboard[] = PROJECTS.map((p) => ({
    id: `dashboard_${p.id}`,
    projectId: p.id,
    name: `${p.name} overview`,
    layout: DEFAULT_LAYOUT,
    ownerId: 'user_0001',
    createdAt: created,
    updatedAt: created,
  }));
  const web = 'proj_web';
  const seeded = hasData
    ? seededAlerts(web, traffic.get(web) ?? [], ref, projects[0]?.sampleRate ?? 1, created)
    : { alerts: [], checks: [] };
  const annotations: Annotation[] = hasData ? releaseAnnotations(web, ref, shape.days) : [];
  const dayAt = (daysAgo: number) =>
    new Date(
      Math.floor((ref - daysAgo * MS_PER_DAY) / MS_PER_DAY) * MS_PER_DAY + 12 * 3_600_000
    ).toISOString();
  if (hasData) {
    for (const spike of shape.spikes) {
      const daysAgo = Math.max(0, Math.round((ref - Date.parse(String(spike.at))) / MS_PER_DAY));
      annotations.push({
        id: `annotation_launch_${daysAgo}`,
        projectId: web,
        at: dayAt(daysAgo),
        title: 'Launch: Pebblestat 3.0 on Product Hunt',
        kind: 'campaign',
        authorId: 'user_0001',
      });
    }
    for (const o of shape.outages) {
      annotations.push({
        id: `annotation_outage_${o.daysAgo}`,
        projectId: web,
        at: dayAt(o.daysAgo),
        title: 'Ingestion outage: events delayed and partly lost',
        kind: 'incident',
        authorId: 'user_0002',
      });
    }
  }
  annotations.sort((a, b) => (a.at < b.at ? -1 : 1));

  // Active users in the last 24 hours seed the live counter; the timeline moves it from there.
  const since = isoString(ref - MS_PER_DAY);
  const recent = new Set<string>();
  for (let i = events.length - 1; i >= 0 && (events[i] as TrackedEvent).at > since; i--) {
    recent.add((events[i] as TrackedEvent).userId);
  }
  const counters: LiveCounterRow[] = [
    {
      id: LIVE_COUNTER,
      value: Math.round(recent.size / rate),
      updatedAt: ctx.scenario.referenceTime,
    },
  ];

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      projects,
      users,
      events,
      rollups,
      dashboards,
      segments: hasData ? defaultSegments(web, created) : [],
      reports: hasData ? defaultReports(web, created) : [],
      alerts: seeded.alerts,
      alertChecks: seeded.checks,
      annotations,
      counters,
      activity: [],
    },
  };
}

/** The payload of a timeline alert check. */
export interface AlertCheckPayload {
  alertId: string;
  value: number;
}

/**
 * One check per alert per day at 09:00 UTC. The value depends only on the
 * scenario seed, the alert id and the day, so advancing a week at once yields
 * the same checks (same ids) as advancing seven times by a day.
 */
export function alertCheckEvents(
  scenario: { id: string; seed: number },
  alerts: readonly Pick<MetricAlert, 'id' | 'baseline'>[],
  from: Date,
  to: Date
): DomainEvent<AlertCheckPayload>[] {
  const out: DomainEvent<AlertCheckPayload>[] = [];
  const first = Math.floor(from.getTime() / MS_PER_DAY) * MS_PER_DAY;
  for (let day = first; day <= to.getTime(); day += MS_PER_DAY) {
    const at = day + 9 * 3_600_000;
    if (at <= from.getTime() || at > to.getTime()) continue;
    const iso = isoString(day).slice(0, 10);
    for (const alert of alerts) {
      const rng = createRng(`pebblestat:alert:${scenario.id}:${scenario.seed}:${alert.id}:${iso}`);
      // Usually around the baseline; now and then a sharp dip or surge.
      const shock = rng.chance(0.15) ? (rng.chance(0.5) ? 0.3 : 2.8) : 1;
      out.push({
        id: `alert-check:${alert.id}:${iso}`,
        type: 'alert.check',
        at: isoString(at),
        payload: {
          alertId: alert.id,
          value: Math.round(alert.baseline * shock * (0.8 + 0.4 * rng.next())),
        },
        source: 'timeline',
      });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}

/** Deterministic events for simulated time: live counter bumps and daily alert checks. */
export async function pebblestatTimeline(ctx: TimelineContext): Promise<DomainEvent[]> {
  const opts = generatorOptions(ctx);
  if (ctx.scenario.density === 'empty' || opts.users === 0) return [];
  const alerts = (await ctx.read('alerts')) as unknown as MetricAlert[];
  return [
    ...liveCounterEvents(
      { scenario: ctx.scenario, from: ctx.from, to: ctx.to },
      {
        counter: LIVE_COUNTER,
        perDay: Math.round((ctx.scale(opts.users) * 2) / (opts.sampleRate ?? 1)),
        hours: [7, 22],
      }
    ),
    ...alertCheckEvents(ctx.scenario, alerts, ctx.from, ctx.to),
  ];
}
