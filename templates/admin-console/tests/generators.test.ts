import type { Membership, WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { Subscription, Tenant, UserAccess } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import { generateAdminWorld, PLAN_PRICES } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];

describe('admin console generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = generateAdminWorld(contextFor('operations'));
    expect(generateAdminWorld(contextFor('operations'))).toEqual(a);
    expect(generateAdminWorld(contextFor('operations', 77)).tables.tenants).not.toEqual(
      a.tables.tenants
    );
  });

  it('passes integrity for every scenario and gives the actor its staff role', () => {
    for (const input of definition.scenarios) {
      const ctx = contextFor(input.id);
      const world = generateAdminWorld(ctx);
      expect(
        validateWorld(world, {
          ...definition.integrity,
          referenceTime: ctx.scenario.referenceTime,
        }),
        input.id
      ).toEqual([]);
      const membership = world.memberships.find((m) => m.personaId === ctx.scenario.actor.id);
      expect(membership, input.id).toMatchObject({
        role: ctx.scenario.actor.role,
        organizationId: 'org_0001',
      });
    }
  });

  it('models tenants as organizations whose people are personas with tenant roles', () => {
    const world = generateAdminWorld(contextFor('operations'));
    const tenants = rows<Tenant>(world, 'tenants');
    expect(tenants).toHaveLength(24);
    const orgIds = new Set(world.organizations.map((o) => o.id));
    for (const tenant of tenants) {
      expect(orgIds.has(tenant.id)).toBe(true);
      expect(tenant.domain).toMatch(/\.example$/);
    }
    const access = rows<UserAccess>(world, 'user_access');
    const tenantRoles = new Set(
      world.memberships
        .filter((m: Membership) => m.organizationId !== 'org_0001')
        .map((m) => m.role)
    );
    expect([...tenantRoles].every((r) => r.startsWith('tenant_'))).toBe(true);
    expect(access.length).toBe(
      world.memberships.filter((m) => m.organizationId !== 'org_0001').length
    );
    for (const person of world.personas.filter((p) => p.id.startsWith('tuser'))) {
      expect(person.email).toMatch(/\.example$/);
    }
  });

  it('prices subscriptions in integer cents and keeps states consistent', () => {
    const world = generateAdminWorld(contextFor('incident'));
    const tenants = new Map(rows<Tenant>(world, 'tenants').map((t) => [t.id, t]));
    for (const sub of rows<Subscription>(world, 'subscriptions')) {
      const tenant = tenants.get(sub.tenantId) as Tenant;
      expect(Number.isInteger(sub.mrrCents)).toBe(true);
      if (sub.status === 'canceled') expect(tenant.status).toBe('churned');
      if (sub.status === 'active' || sub.status === 'past_due') {
        expect(sub.mrrCents).toBe(PLAN_PRICES[sub.plan] * sub.seats);
      }
    }
    const suspended = rows<Tenant>(world, 'tenants').filter((t) => t.status === 'suspended');
    expect(suspended.length).toBeGreaterThan(0);
    expect(suspended.every((t) => t.suspendedAt && t.suspendedReason)).toBe(true);
    expect(world.events?.filter((e) => e.type === 'tenant.suspended')).toHaveLength(
      suspended.length
    );
  });

  it('the empty scenario has staff and nothing else', () => {
    const world = generateAdminWorld(contextFor('empty'));
    expect(rows(world, 'tenants')).toEqual([]);
    expect(world.organizations).toHaveLength(1);
    expect(world.personas).toHaveLength(4);
  });
});
