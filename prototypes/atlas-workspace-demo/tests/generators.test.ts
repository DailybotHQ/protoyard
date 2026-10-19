import { parseScenario, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { AppEvent, Customer, Order } from '../src/database/schema.ts';
import { dailyRevenue, overviewStats } from '../src/domain/metrics.ts';
import { definition } from '../src/prototype.ts';
import { generateDashboardWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];

describe('dashboard generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = generateDashboardWorld(contextFor('active'));
    const b = generateDashboardWorld(contextFor('active'));
    expect(a).toEqual(b);
    const c = generateDashboardWorld(contextFor('active', 77));
    expect(c.tables.customers).not.toEqual(a.tables.customers);
  });

  it('passes the integrity rules for every scenario and gives the actor its scenario role', () => {
    for (const input of definition.scenarios) {
      const ctx = contextFor(input.id);
      const world = generateDashboardWorld(ctx);
      const violations = validateWorld(world, {
        ...definition.integrity,
        referenceTime: ctx.scenario.referenceTime,
      });
      expect(violations, input.id).toEqual([]);
      const membership = world.memberships.find((m) => m.personaId === ctx.scenario.actor.id);
      expect(membership?.role, input.id).toBe(ctx.scenario.actor.role);
      expect(rows(world, 'settings')).toHaveLength(1);

      const customers = new Map(rows<Customer>(world, 'customers').map((c) => [c.id, c]));
      for (const order of rows<Order>(world, 'orders')) {
        const customer = customers.get(order.customerId);
        expect(customer).toBeDefined();
        expect(order.createdAt >= (customer?.createdAt ?? '')).toBe(true);
        expect(order.updatedAt >= order.createdAt).toBe(true);
      }
      const references = rows<Order>(world, 'orders').map((o) => o.reference);
      expect(new Set(references).size).toBe(references.length);
      // Viewers never author anything.
      const viewers = new Set(
        world.memberships.filter((m) => m.role === 'viewer').map((m) => m.personaId)
      );
      for (const event of rows<AppEvent>(world, 'events'))
        expect(viewers.has(event.actorId)).toBe(false);
    }
  });

  it('scales from an empty workspace to a dense one', () => {
    const empty = generateDashboardWorld(contextFor('empty'));
    const active = generateDashboardWorld(contextFor('active'));
    const dense = generateDashboardWorld(contextFor('massive'));
    expect(rows(empty, 'customers')).toHaveLength(0);
    expect(rows(empty, 'orders')).toHaveLength(0);
    expect(rows(active, 'customers')).toHaveLength(36);
    expect(rows(dense, 'customers')).toHaveLength(180);
    expect(rows(dense, 'orders').length).toBeGreaterThan(500);
  });

  it('gives the viewer scenario the same world as the active one', () => {
    const active = generateDashboardWorld(contextFor('active'));
    const viewer = generateDashboardWorld(contextFor('viewer'));
    expect(viewer.tables).toEqual(active.tables);
  });

  it('feeds the overview with revenue for the chart', () => {
    const ctx = contextFor('active');
    const world = generateDashboardWorld(ctx);
    const now = new Date(ctx.scenario.referenceTime);
    const series = dailyRevenue(rows<Order>(world, 'orders'), now, 14);
    expect(series).toHaveLength(14);
    expect(series.at(-1)?.day).toBe(ctx.scenario.referenceTime.slice(0, 10));
    expect(series.some((d) => d.total > 0)).toBe(true);
    const stats = overviewStats(
      rows<Customer>(world, 'customers'),
      rows<Order>(world, 'orders'),
      now
    );
    expect(stats.revenue30).toBeGreaterThan(0);
    expect(stats.activeCustomers).toBeGreaterThan(0);
  });

  it('accepts every scenario as valid', () => {
    for (const input of definition.scenarios) expect(() => parseScenario(input)).not.toThrow();
  });
});
