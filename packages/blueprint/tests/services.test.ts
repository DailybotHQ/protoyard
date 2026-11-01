import {
  createPermissionPolicy,
  PermissionDeniedError,
  type Persona,
  type PrototypeRuntime,
  type Row,
  resolvePrincipal,
  ValidationError,
} from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  type Blueprint,
  CAPABILITIES,
  createEntityServices,
  derivePolicy,
  EntityInUseError,
  type EntityServices,
  parseBlueprint,
} from '../src/index.ts';

// A fresh in-memory IndexedDB per test: worlds and overrides never leak between tests.
let harness = createHarness(createBlueprintDefinition());
beforeEach(() => {
  harness = createHarness(createBlueprintDefinition());
});
afterEach(() => harness.closeAll());

interface Table {
  toArray(): Promise<Row[]>;
  count(): Promise<number>;
}
const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): Table }).table(name);
const rows = (runtime: PrototypeRuntime, name: string) => table(runtime, name).toArray();

async function boot(
  scenario = 'owner'
): Promise<{ runtime: PrototypeRuntime; services: EntityServices }> {
  const runtime = await harness.boot(scenario);
  return { runtime, services: createEntityServices(runtime, helpdeskBlueprint) };
}

/** Every domain table as JSON, to prove a failed operation wrote nothing. */
async function world(runtime: PrototypeRuntime) {
  const names = ['customers', 'tickets', 'invoices', 'notes'];
  return JSON.stringify(await Promise.all(names.map((n) => rows(runtime, n))));
}

const actorId = (runtime: PrototypeRuntime) => runtime.session.principal()?.persona.id as string;

describe('createEntityServices', () => {
  it('creates rows with runtime ids, clock timestamps and the actor as owner, and they survive a reload', async () => {
    const { runtime, services } = await boot();
    const customer = await services.customer!.create({ name: '  Northwind Example  ' });
    expect(customer.id).toMatch(/^customer_u[0-9a-f]{12}$/);
    expect(customer).toMatchObject({
      name: 'Northwind Example',
      email: null,
      accountManagerId: actorId(runtime),
      createdAt: runtime.clock.now().toISOString(),
      updatedAt: runtime.clock.now().toISOString(),
    });
    const ticket = await services.ticket!.create({
      subject: 'Printer jam',
      customerId: customer.id,
    });
    expect(ticket).toMatchObject({ status: 'open', assigneeId: actorId(runtime), labels: [] });

    const reloaded = await harness.reload(runtime);
    const again = createEntityServices(reloaded, helpdeskBlueprint);
    expect(await again.customer!.get(customer.id)).toEqual(customer);
    expect(await again.ticket!.get(ticket.id)).toEqual(ticket);
  });

  it('returns field-keyed validation errors, including missing relation targets, and writes nothing', async () => {
    const { runtime, services } = await boot();
    const before = await world(runtime);
    await expect(services.ticket!.create({ subject: 'ab' })).rejects.toMatchObject({
      issues: {
        subject: 'Subject must have at least 3 characters',
        customerId: 'Customer is required',
      },
    });
    const error = await services
      .ticket!.create({ subject: 'Lost customer', customerId: 'customer_9999' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual({ customerId: 'Customer not found' });
    await expect(
      services.ticket!.create({
        subject: 'Ghost owner',
        customerId: 'customer_0001',
        assigneeId: 'user_9999',
      })
    ).rejects.toMatchObject({ issues: { assigneeId: 'Assignee not found' } });
    expect(await world(runtime)).toBe(before);
  });

  it('denies a viewer every mutation in the service layer', async () => {
    const { runtime, services } = await boot('viewer');
    const before = await world(runtime);
    const [ticket] = await services.ticket!.list();
    await expect(services.customer!.create({ name: 'Blocked Co' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(services.ticket!.update(ticket!.id, { status: 'solved' })).rejects.toMatchObject({
      capability: 'ticket:update',
    });
    await expect(services.ticket!.remove(ticket!.id)).rejects.toMatchObject({
      capability: 'ticket:delete',
    });
    await expect(services.ticket!.bulkRemove([ticket!.id])).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await world(runtime)).toBe(before);
  });

  it('lets a member change only their own tickets (update:own / delete:own)', async () => {
    const { runtime, services } = await boot('member');
    const me = actorId(runtime);
    const mine = await services.ticket!.create({
      subject: 'My ticket',
      customerId: 'customer_0001',
    });
    await expect(services.ticket!.update(mine.id, { status: 'pending' })).resolves.toMatchObject({
      status: 'pending',
    });
    const theirs = (await services.ticket!.list()).find((t) => t.assigneeId !== me);
    expect(theirs).toBeDefined();
    await expect(services.ticket!.update(theirs!.id, { status: 'solved' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(
      services.ticket!.bulkUpdate([mine.id, theirs!.id], { status: 'solved' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((await services.ticket!.get(mine.id))?.status).toBe('pending');
    await services.ticket!.remove(mine.id);
    expect(await services.ticket!.get(mine.id)).toBeUndefined();
  });

  it('writes nothing when offline or when the simulated server fails', async () => {
    const { runtime, services } = await boot();
    const before = await world(runtime);
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(services.customer!.create({ name: 'Offline Co' })).rejects.toMatchObject({
      code: 'offline',
    });
    await expect(services.customer!.remove('customer_0002')).rejects.toMatchObject({
      code: 'offline',
    });
    await runtime.overrides.set({
      environment: {
        network: 'online',
        failureMode: 'server-error',
        failureRate: 1,
        failureScope: ['ticket.'],
      },
    });
    await expect(
      services.ticket!.bulkUpdate(['ticket_0001'], { status: 'solved' })
    ).rejects.toMatchObject({
      code: 'server-error',
    });
    expect(await world(runtime)).toBe(before);
    // Outside the failure scope, writes still work.
    await expect(services.customer!.create({ name: 'Scoped Co' })).resolves.toMatchObject({
      name: 'Scoped Co',
    });
  });

  it('cascades, nullifies and restricts deletes in one transaction', async () => {
    const { runtime, services } = await boot();
    // customer_0002 has tickets 0003/0004 (cascade) and note_0001 points at ticket_0003 (nullify).
    const deleted = await services.customer!.bulkRemove(['customer_0002']);
    expect(deleted).toBe(3);
    expect((await rows(runtime, 'tickets')).map((t) => t.id)).toEqual([
      'ticket_0001',
      'ticket_0002',
      'ticket_0005',
      'ticket_0006',
    ]);
    const [note] = await rows(runtime, 'notes');
    expect(note).toMatchObject({ ticketId: null, relatedIds: ['ticket_0005'] });
    expect(note!.updatedAt).toBe(runtime.clock.now().toISOString());

    // customer_0001 has an invoice (restrict): the whole delete, cascade included, is refused.
    const before = await world(runtime);
    const error = await services.customer!.remove('customer_0001').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EntityInUseError);
    expect((error as Error).message).toBe(
      "This customer can't be deleted: 1 invoices still reference it."
    );
    expect(await world(runtime)).toBe(before);
  });
});

function policyFixture(): Blueprint {
  return parseBlueprint({
    formatVersion: 1,
    name: 'Policy fixture',
    entities: [
      {
        name: 'ticket',
        plural: 'tickets',
        fields: [
          { name: 'subject', kind: 'text' },
          { name: 'owner', kind: 'persona' },
        ],
        titleField: 'subject',
        ownerField: 'owner',
      },
    ],
    roles: [
      { name: 'owner', permissions: { '*': ['*'] } },
      { name: 'admin', permissions: { ticket: ['read', 'create', 'update', 'delete'] } },
      { name: 'member', permissions: { ticket: ['read', 'create', 'update:own', 'delete:own'] } },
      { name: 'viewer', permissions: { '*': ['read'] } },
    ],
  });
}

function principal(
  policy: ReturnType<typeof createPermissionPolicy>,
  role: string,
  id = 'user_001'
) {
  const persona = {
    id,
    name: 'Alex Example',
    joinedAt: '2026-10-17T00:00:00.000Z',
  } as Persona;
  const membership = {
    id: 'membership_001',
    personaId: id,
    organizationId: 'org_001',
    role,
    joinedAt: '2026-10-17T00:00:00.000Z',
    capabilities: [],
  };
  return resolvePrincipal(persona, null, membership, policy);
}

describe('derivePolicy', () => {
  it('derives per-entity capabilities and checks owner/admin/member/viewer through the runtime policy', () => {
    const blueprint = policyFixture();
    const policy = createPermissionPolicy(derivePolicy(blueprint));
    const caps = CAPABILITIES(blueprint);
    const owner = principal(policy, 'owner', 'owner_001');
    const admin = principal(policy, 'admin', 'admin_001');
    const member = principal(policy, 'member', 'member_001');
    const viewer = principal(policy, 'viewer', 'viewer_001');
    const ticketCaps = caps.ticket;
    if (!ticketCaps) throw new Error('Fixture ticket capabilities are missing.');

    expect(ticketCaps).toEqual({
      read: 'ticket:read',
      create: 'ticket:create',
      update: 'ticket:update',
      updateOwn: 'ticket:update:own',
      delete: 'ticket:delete',
      deleteOwn: 'ticket:delete:own',
      import: 'ticket:import',
      export: 'ticket:export',
    });
    expect(caps.members.all).toBe('members:*');
    expect(policy.can(owner, ticketCaps.delete, { ownerId: 'someone_else' })).toBe(true);
    expect(policy.can(admin, ticketCaps.create)).toBe(true);
    expect(policy.can(admin, ticketCaps.delete, { ownerId: 'someone_else' })).toBe(true);
    expect(policy.can(admin, caps.members.all)).toBe(true);
    expect(policy.can(member, ticketCaps.create)).toBe(true);
    expect(policy.can(member, ticketCaps.updateOwn, { ownerId: 'member_001' })).toBe(true);
    expect(policy.can(member, ticketCaps.updateOwn, { ownerId: 'other_001' })).toBe(false);
    expect(policy.can(member, ticketCaps.deleteOwn, { ownerId: 'member_001' })).toBe(true);
    expect(policy.can(member, ticketCaps.deleteOwn, { ownerId: 'other_001' })).toBe(false);
    expect(policy.can(member, caps.members.all)).toBe(false);
    expect(policy.can(viewer, ticketCaps.read)).toBe(true);
    expect(policy.can(viewer, ticketCaps.create)).toBe(false);
    expect(policy.can(viewer, caps.members.all)).toBe(false);
  });

  it('expands entity and action wildcards and keeps explicit denials authoritative', () => {
    const blueprint = policyFixture();
    const adminRole = blueprint.roles.find((role) => role.name === 'admin');
    if (!adminRole) throw new Error('Fixture admin role is missing.');
    const withWildcardAndDenial = parseBlueprint({
      ...blueprint,
      roles: blueprint.roles.map((role) =>
        role.name === 'admin' ? { ...role, permissions: { ticket: ['*', '-ticket:delete'] } } : role
      ),
    });
    const policy = createPermissionPolicy(derivePolicy(withWildcardAndDenial));
    const admin = principal(policy, 'admin');
    expect(policy.can(admin, 'ticket:export')).toBe(true);
    expect(policy.can(admin, 'ticket:delete')).toBe(false);
  });
});
