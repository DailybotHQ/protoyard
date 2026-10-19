import { AnalyticsEventSchema, DashboardLayoutSchema } from '@protoyard/analytics';
import { computeRetention } from '@protoyard/analytics/cohort';
import { computeFunnel } from '@protoyard/analytics/funnel';
import { MS_PER_DAY, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type {
  DailyRollup,
  MetricAlert,
  TrackedEvent,
  TrackedUser,
} from '../src/database/schema.ts';
import { ACTIVATION_FUNNEL } from '../src/domain/catalog.ts';
import { definition } from '../src/prototype.ts';
import { alertCheckEvents, generatePebblestatWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const world = (id: string) => generatePebblestatWorld(contextFor(id));
const rows = <T>(w: WorldSeed, table: string) => (w.tables[table] ?? []) as unknown as T[];
const REF = Date.parse('2026-10-16T09:00:00.000Z');
const web = (events: TrackedEvent[]) => events.filter((e) => e.projectId === 'proj_web');
const perDay = (events: TrackedEvent[], daysAgo: number) => {
  const start = Math.floor((REF - daysAgo * MS_PER_DAY) / MS_PER_DAY) * MS_PER_DAY;
  return events.filter((e) => Date.parse(e.at) >= start && Date.parse(e.at) < start + MS_PER_DAY)
    .length;
};

describe('Pebblestat generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = world('healthy-growth');
    expect(world('healthy-growth')).toEqual(a);
    expect(generatePebblestatWorld(contextFor('healthy-growth', 77)).tables.events).not.toEqual(
      a.tables.events
    );
  });

  it.each(definition.scenarios.map((s) => s.id))(
    '%s passes the integrity rules (userId, projectId, alertId…)',
    (id) => {
      const ctx = contextFor(id);
      const w = generatePebblestatWorld(ctx);
      expect(
        validateWorld(w, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime })
      ).toEqual([]);
      expect(w.memberships.find((m) => m.personaId === ctx.scenario.actor.id)?.role).toBe(
        ctx.scenario.actor.role
      );
      expect(w.memberships.map((m) => m.role).sort()).toEqual(
        [
          ctx.scenario.actor.role,
          ...['owner', 'analyst', 'viewer'].filter(
            (_, i) => `user_000${i + 1}` !== ctx.scenario.actor.id
          ),
        ].sort()
      );
      const events = rows<TrackedEvent>(w, 'events');
      // Events are the @protoyard/analytics shape plus the project they belong to.
      for (const { projectId: _project, ...e } of events.slice(0, 200))
        expect(AnalyticsEventSchema.safeParse(e).success).toBe(true);
      for (let i = 1; i < events.length; i++)
        expect((events[i] as TrackedEvent).at >= (events[i - 1] as TrackedEvent).at).toBe(true);
      expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
      const users = new Map(rows<TrackedUser>(w, 'users').map((u) => [u.id, u]));
      for (const e of events) expect(users.get(e.userId)?.projectId).toBe(e.projectId);
      for (const d of rows<{ layout: unknown }>(w, 'dashboards'))
        expect(DashboardLayoutSchema.safeParse(d.layout).success).toBe(true);
    }
  );

  it('starts the new project empty but ready, and scales to the enterprise sample', () => {
    const empty = world('new-project');
    expect(rows(empty, 'events')).toHaveLength(0);
    expect(rows(empty, 'projects')).toHaveLength(2);
    expect(rows(empty, 'dashboards')).toHaveLength(2);
    expect(rows(empty, 'alerts')).toHaveLength(0);
    const healthy = rows<TrackedEvent>(world('healthy-growth'), 'events');
    expect(healthy.length).toBeGreaterThan(1000);
    expect(healthy.some((e) => e.projectId === 'proj_mobile')).toBe(true);
  });

  it('stores enterprise scale as ~100k events in daily rollups plus a 5 % user sample', () => {
    const w = world('enterprise-scale');
    const sample = web(rows<TrackedEvent>(w, 'events'));
    const rollups = rows<DailyRollup>(w, 'rollups');
    const full = rollups.reduce((s, r) => s + r.count, 0);
    expect(sample.length).toBeGreaterThan(4_000);
    expect(full).toBeGreaterThan(90_000);
    expect(Math.abs(full - sample.length / 0.05)).toBeLessThan(full * 0.03);
    // Rollups agree with the sample day by day and type by type.
    const day = sample.at(-1)?.at.slice(0, 10) as string;
    const views = sample.filter((e) => e.at.startsWith(day) && e.type === 'page_view').length;
    const rolled = rollups.find((r) => r.day === day && r.type === 'page_view')?.count ?? 0;
    // Within the ±3 % jitter of the sample scaled by 1 / rate.
    expect(Math.abs(rolled - views / 0.05)).toBeLessThanOrEqual((views / 0.05) * 0.03 + 1);
    expect(rows<{ sampleRate: number }>(w, 'projects').map((p) => p.sampleRate)).toEqual([0.05, 1]);
  });

  it('gives every user an ordered activation journey (a narrowing funnel)', () => {
    const w = world('healthy-growth');
    const events = web(rows<TrackedEvent>(w, 'events'));
    const { steps } = computeFunnel(events, ACTIVATION_FUNNEL);
    const counts = steps.map((s) => s.count);
    expect(counts[0]).toBe(
      rows<TrackedUser>(w, 'users').filter((u) => u.projectId === 'proj_web').length
    );
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('shapes traffic: launch wave, outage dip with a fired alert, churn-risk cohorts', () => {
    const healthy = web(rows<TrackedEvent>(world('healthy-growth'), 'events'));
    const outageWorld = world('outage-incident');
    const outage = web(rows<TrackedEvent>(outageWorld, 'events'));
    expect(perDay(outage, 6)).toBeLessThan(perDay(healthy, 6) * 0.35);
    expect(perDay(outage, 20)).toBe(perDay(healthy, 20));
    const pageViews = rows<MetricAlert>(outageWorld, 'alerts').find(
      (a) => a.eventType === 'page_view'
    );
    expect(pageViews?.lastFiredAt).not.toBeNull();
    expect(
      rows<{ title: string }>(outageWorld, 'annotations').some((a) =>
        a.title.startsWith('Ingestion outage')
      )
    ).toBe(true);

    const launch = web(rows<TrackedEvent>(world('launch-day'), 'events'));
    const signups = (d: number) =>
      perDay(
        launch.filter((e) => e.type === 'signup'),
        d
      );
    expect(signups(1) + signups(2)).toBeGreaterThan((signups(20) + signups(21)) * 2);

    const retention = (id: string) =>
      computeRetention(web(rows<TrackedEvent>(world(id), 'events')), {
        cohortEvent: 'signup',
        interval: 'week',
        periods: 3,
        now: REF,
      });
    // Cohorts from 5–8 weeks ago keep far fewer users in week 2 than the same weeks of a healthy world.
    const week2 = (id: string) =>
      retention(id)
        .cohorts.filter((c) => c.start >= REF - 56 * MS_PER_DAY && c.start < REF - 35 * MS_PER_DAY)
        .map((c) => c.cells[2]?.rate ?? 0);
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    expect(avg(week2('churn-risk'))).toBeLessThan(avg(week2('healthy-growth')) * 0.6);
  });

  it('seeds alert checks from the actual daily counts', () => {
    const w = world('healthy-growth');
    const alerts = rows<MetricAlert>(w, 'alerts');
    const checks = rows<{ alertId: string; value: number; at: string }>(w, 'alertChecks');
    expect(alerts).toHaveLength(2);
    const pv = alerts.find((a) => a.eventType === 'page_view') as MetricAlert;
    const lastDay = checks.filter((c) => c.alertId === pv.id).at(-1) as {
      value: number;
      at: string;
    };
    const events = web(rows<TrackedEvent>(w, 'events'));
    expect(lastDay.value).toBe(
      events.filter((e) => e.type === 'page_view' && e.at.startsWith(lastDay.at.slice(0, 10)))
        .length
    );
  });
});

describe('alert checks on the timeline', () => {
  const scenario = { id: 'healthy-growth', seed: 4242 };
  const alerts = [
    { id: 'alert_a', baseline: 120 },
    { id: 'alert_b', baseline: 8 },
  ];
  const at = (days: number) => new Date(REF + days * MS_PER_DAY);

  it('is window-independent: one 7-day advance equals seven 1-day advances (same ids and values)', () => {
    const once = alertCheckEvents(scenario, alerts, at(0), at(7));
    const steps = Array.from({ length: 7 }, (_, i) =>
      alertCheckEvents(scenario, alerts, at(i), at(i + 1))
    ).flat();
    expect(once).toHaveLength(14);
    expect(steps).toEqual(once);
    expect(new Set(once.map((e) => e.id)).size).toBe(14);
  });

  it('depends on the scenario seed and the alert, not on the other alerts', () => {
    const alone = alertCheckEvents(scenario, [alerts[0] as (typeof alerts)[number]], at(0), at(7));
    const both = alertCheckEvents(scenario, alerts, at(0), at(7)).filter(
      (e) => e.payload.alertId === 'alert_a'
    );
    expect(both).toEqual(alone);
    expect(alertCheckEvents({ ...scenario, seed: 1 }, alerts, at(0), at(7))).not.toEqual(
      alertCheckEvents(scenario, alerts, at(0), at(7))
    );
  });
});
