import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { DashboardDatabase } from '../src/database/schema.ts';
import { createServices, TransitionError } from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and opens a new one on the same storage, like a page
 * reload, so these prove persistence — not just in-memory state.
 */

let harness = createHarness<DashboardDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<DashboardDatabase>(definition);
});

describe('dashboard services on the real runtime', () => {
  it('creates, edits and deletes a customer that survives reloads, with an audit trail', async () => {
    let runtime = await harness.boot('empty');
    let services = createServices(runtime);

    const customer = await services.customers.create({
      name: 'Ada Lovelace',
      email: 'ADA@example.com',
      company: 'Analytical Engines',
      plan: 'growth',
      status: 'trial',
    });
    expect(customer.email).toBe('ada@example.com');
    expect(customer.ownerId).toBe('user_0001');

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect((await runtime.db.customers.get(customer.id))?.name).toBe('Ada Lovelace');

    await services.customers.update(customer.id, {
      name: 'Ada King',
      email: 'ada@example.com',
      plan: 'enterprise',
      status: 'active',
    });
    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect(await runtime.db.customers.get(customer.id)).toMatchObject({
      name: 'Ada King',
      plan: 'enterprise',
      status: 'active',
    });
    const trail = await runtime.db.events.where('customerId').equals(customer.id).toArray();
    expect(trail.map((e) => e.type).sort()).toEqual(['customer.created', 'customer.updated']);

    const order = await services.orders.create({
      customerId: customer.id,
      description: 'Annual plan',
      amount: '1200',
    });
    expect(order).toMatchObject({ reference: 'ORD-1001', status: 'pending', amount: 1200 });

    await services.customers.remove(customer.id);
    runtime = await harness.reload(runtime);
    expect(await runtime.db.customers.get(customer.id)).toBeUndefined();
    expect(await runtime.db.orders.where('customerId').equals(customer.id).count()).toBe(0);
    expect(await runtime.db.events.where('customerId').equals(customer.id).count()).toBe(0);
    expect((await runtime.db.events.toArray()).map((e) => e.type)).toContain('customer.deleted');
  });

  it('changes order status and logs the event in the same transaction', async () => {
    let runtime = await harness.boot('active');
    let services = createServices(runtime);
    const pending = await runtime.db.orders.where('status').equals('pending').first();
    if (!pending) throw new Error('the active scenario has pending orders');
    const before = await runtime.db.events.count();

    await services.orders.setStatus(pending.id, 'paid');
    await expect(services.orders.setStatus(pending.id, 'cancelled')).rejects.toBeInstanceOf(
      TransitionError
    );

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect((await runtime.db.orders.get(pending.id))?.status).toBe('paid');
    const logged = await runtime.db.events.where('orderId').equals(pending.id).toArray();
    expect(
      logged.some((e) => e.type === 'order.status_changed' && e.message.includes('Pending → Paid'))
    ).toBe(true);
    expect(await runtime.db.events.count()).toBe(before + 1);

    // A simulated failure rolls back nothing half-way: neither row changes.
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(services.orders.setStatus(pending.id, 'fulfilled')).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect((await runtime.db.orders.get(pending.id))?.status).toBe('paid');
    expect(await runtime.db.events.count()).toBe(before + 1);
  });

  it('returns field-level validation errors', async () => {
    const runtime = await harness.boot('empty');
    const services = createServices(runtime);
    const error = await services.customers
      .create({ name: 'A', email: 'nope', plan: 'starter', status: 'active' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys((error as ValidationError).issues).sort()).toEqual(['email', 'name']);
    await expect(
      services.orders.create({ customerId: 'missing', description: 'X order', amount: 10 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('enforces roles at service level, including the settings section', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const customer = await runtime.db.customers.toCollection().first();
    if (!customer) throw new Error('seeded customers');
    const input = {
      workspaceName: 'Renamed',
      supportEmail: 'help@example.com',
      currency: 'EUR' as const,
      weeklyReport: false,
    };

    await runtime.session.switchActor('user_0003'); // member
    await services.customers.update(customer.id, { ...customer });
    await expect(services.customers.remove(customer.id)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(services.settings.update(input)).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0004'); // viewer
    await expect(
      services.customers.create({
        name: 'Nope',
        email: 'n@example.com',
        plan: 'starter',
        status: 'trial',
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0002'); // admin
    const saved = await services.settings.update(input);
    expect(saved).toMatchObject({ currency: 'EUR', updatedBy: 'user_0002' });
    expect(runtime.session.can('billing:manage')).toBe(false);
  });

  it('starts the viewer scenario as a read-only persona', async () => {
    const runtime = await harness.boot('viewer');
    expect(runtime.session.principal()?.persona.id).toBe('user_0004');
    expect(runtime.session.can('customers:create')).toBe(false);
    expect(await runtime.db.customers.count()).toBe(36);
  });
});
