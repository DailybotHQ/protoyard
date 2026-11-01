import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { DashboardDatabase } from '../src/database/schema.ts';
import { createServices, TransitionError } from '../src/domain/services.ts';
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
  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
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
});
