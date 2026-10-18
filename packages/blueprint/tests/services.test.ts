import {
  PermissionDeniedError,
  type PrototypeRuntime,
  type Row,
  ValidationError,
} from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createEntityServices,
  EntityInUseError,
  EntityNotFoundError,
  type EntityServices,
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

  it('lists rows by defaultSort and returns undefined for unknown ids', async () => {
    const { services } = await boot();
    const subjects = (await services.ticket!.list()).map((t) => t.subject);
    expect(subjects).toEqual([...subjects].sort());
    expect(subjects).toHaveLength(6);
    expect(await services.ticket!.get('ticket_9999')).toBeUndefined();
  });

  it('updates with partial input and keeps id and createdAt', async () => {
    const { runtime, services } = await boot();
    const [first] = await services.ticket!.list();
    const updated = await services.ticket!.update(first!.id, {
      status: 'solved',
      labels: 'vip, billing',
    });
    expect(updated).toMatchObject({
      id: first!.id,
      subject: first!.subject,
      status: 'solved',
      labels: ['vip', 'billing'],
      createdAt: first!.createdAt,
      updatedAt: runtime.clock.now().toISOString(),
    });
    await expect(services.ticket!.update('ticket_9999', { status: 'open' })).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
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

  it('bulk-updates many rows atomically and validates the patch once', async () => {
    const { runtime, services } = await boot();
    const ids = (await services.ticket!.list()).map((t) => t.id);
    const updated = await services.ticket!.bulkUpdate(ids, { status: 'solved' });
    expect(updated).toHaveLength(6);
    expect((await rows(runtime, 'tickets')).every((t) => t.status === 'solved')).toBe(true);
    await expect(services.ticket!.bulkUpdate(ids, { status: 'closed' })).rejects.toMatchObject({
      issues: { status: 'Status must be one of: open, pending, solved' },
    });
    await expect(
      services.ticket!.bulkUpdate([...ids, 'ticket_9999'], { status: 'open' })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect((await rows(runtime, 'tickets')).every((t) => t.status === 'solved')).toBe(true);
  });
});
