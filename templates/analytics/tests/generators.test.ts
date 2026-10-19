import { AnalyticsEventSchema, DashboardLayoutSchema } from '@protoyard/analytics';
import { computeFunnel } from '@protoyard/analytics/funnel';
import { MS_PER_DAY, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { SavedDashboard, TrackedEvent, TrackedUser } from '../src/database/schema.ts';
import { ACTIVATION_FUNNEL } from '../src/domain/catalog.ts';
import { definition } from '../src/prototype.ts';
import { generateAnalyticsWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];
const REF = Date.parse('2026-10-16T09:00:00.000Z');
const perDay = (events: TrackedEvent[], daysAgo: number) => {
  const start = Math.floor((REF - daysAgo * MS_PER_DAY) / MS_PER_DAY) * MS_PER_DAY;
  return events.filter((e) => Date.parse(e.at) >= start && Date.parse(e.at) < start + MS_PER_DAY)
    .length;
};

describe('analytics template generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = generateAnalyticsWorld(contextFor('active'));
    expect(generateAnalyticsWorld(contextFor('active'))).toEqual(a);
    expect(generateAnalyticsWorld(contextFor('active', 77)).tables.events).not.toEqual(
      a.tables.events
    );
  });

  it.each(definition.scenarios.map((s) => s.id))(
    '%s passes the integrity rules with valid events and layouts',
    (id) => {
      const ctx = contextFor(id);
      const world = generateAnalyticsWorld(ctx);
      expect(
        validateWorld(world, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime })
      ).toEqual([]);
      expect(world.memberships.find((m) => m.personaId === ctx.scenario.actor.id)?.role).toBe(
        ctx.scenario.actor.role
      );
      const events = rows<TrackedEvent>(world, 'events');
      for (const e of events.slice(0, 200))
        expect(AnalyticsEventSchema.safeParse(e).success).toBe(true);
      for (let i = 1; i < events.length; i++)
        expect((events[i] as TrackedEvent).at >= (events[i - 1] as TrackedEvent).at).toBe(true);
      expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
      for (const d of rows<SavedDashboard>(world, 'dashboards'))
        expect(DashboardLayoutSchema.safeParse(d.layout).success).toBe(true);
    }
  );

  it('scales from an empty workspace to a massive one', () => {
    const count = (id: string) =>
      rows<TrackedEvent>(generateAnalyticsWorld(contextFor(id)), 'events').length;
    expect(rows(generateAnalyticsWorld(contextFor('empty')), 'users')).toHaveLength(0);
    expect(count('empty')).toBe(0);
    const active = count('active');
    expect(active).toBeGreaterThan(1000);
    expect(count('massive')).toBeGreaterThan(active * 5);
  });

  it('gives every user an ordered activation journey (a narrowing funnel)', () => {
    const world = generateAnalyticsWorld(contextFor('active'));
    const users = rows<TrackedUser>(world, 'users');
    const { steps } = computeFunnel(rows<TrackedEvent>(world, 'events'), ACTIVATION_FUNNEL);
    expect(steps[0]?.count).toBe(users.length);
    const counts = steps.map((s) => s.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(steps.at(-1)?.count).toBeGreaterThan(0);
  });

  it('shapes traffic: a launch wave of signups and an outage dip', () => {
    const quarter = rows<TrackedEvent>(generateAnalyticsWorld(contextFor('active')), 'events');
    const outage = rows<TrackedEvent>(generateAnalyticsWorld(contextFor('outage')), 'events');
    // Same seed and history: only the two outage days lose events.
    expect(perDay(outage, 6)).toBeLessThan(perDay(quarter, 6) * 0.35);
    expect(perDay(outage, 20)).toBe(perDay(quarter, 20));
    const launch = rows<TrackedEvent>(generateAnalyticsWorld(contextFor('launch-spike')), 'events');
    const signups = (daysAgo: number) =>
      perDay(
        launch.filter((e) => e.type === 'signup'),
        daysAgo
      );
    expect(signups(1) + signups(2)).toBeGreaterThan((signups(20) + signups(21)) * 2);
  });

  it('gives the viewer scenario the same world as the active one', () => {
    expect(generateAnalyticsWorld(contextFor('viewer')).tables).toEqual(
      generateAnalyticsWorld(contextFor('active')).tables
    );
  });

  it('moves the live counter on the timeline, window-independently', async () => {
    const ctx = contextFor('active');
    const timeline = definition.timeline;
    if (!timeline) throw new Error('timeline missing');
    const from = new Date(REF);
    const at = (days: number) => new Date(REF + days * MS_PER_DAY);
    const read = async () => [];
    const once = await timeline({ ...ctx, from, to: at(2), read });
    const twice = [
      ...(await timeline({ ...ctx, from, to: at(1), read })),
      ...(await timeline({ ...ctx, from: at(1), to: at(2), read })),
    ];
    expect(once.length).toBeGreaterThan(20);
    expect(twice).toEqual(once);
    expect(await timeline({ ...contextFor('empty'), from, to: at(2), read })).toEqual([]);
  });
});
