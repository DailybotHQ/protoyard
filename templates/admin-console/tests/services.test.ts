import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { AdminDatabase, Tenant } from '../src/database/schema.ts';
import { type AuditEvent, createServices, ValidationError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and reopens it on the same storage, like a page reload.
 */

let harness = createHarness<AdminDatabase>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<AdminDatabase>(definition);
  location.hash = '';
});

const userEvents = async (db: AdminDatabase) =>
  (await db.table<AuditEvent, string>('py_events').toArray()).filter((e) => e.source === 'user');
const activeTenant = async (db: AdminDatabase) =>
  (await db.tenants.toArray()).find((t) => t.status === 'active') as Tenant;

describe('admin console services on the real runtime', () => {
  it('suspends a tenant with a reason, audits it, survives reload, then reactivates', async () => {
    let runtime = await harness.boot('operations');
    let services = createServices(runtime);
    const tenant = await activeTenant(runtime.db);

    await expect(services.tenants.suspend(tenant.id, { reason: 'no' })).rejects.toBeInstanceOf(
      ValidationError
    );
    const suspended = await services.tenants.suspend(tenant.id, {
      reason: 'Chargeback under review',
    });
    expect(suspended).toMatchObject({
      status: 'suspended',
      suspendedReason: 'Chargeback under review',
    });
    await expect(
      services.tenants.suspend(tenant.id, { reason: 'Chargeback again' })
    ).rejects.toThrow(/already suspended/);

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect((await runtime.db.tenants.get(tenant.id))?.status).toBe('suspended');
    const [entry] = await userEvents(runtime.db);
    expect(entry).toMatchObject({
      type: 'tenant.suspended',
      actorId: 'user_0001',
      payload: { tenantId: tenant.id, reason: 'Chargeback under review' },
    });

    await services.tenants.reactivate(tenant.id);
    expect((await runtime.db.tenants.get(tenant.id))?.status).toBe('active');
    expect((await userEvents(runtime.db)).map((e) => e.type).sort()).toEqual([
      'tenant.reactivated',
      'tenant.suspended',
    ]);
  });

  it('denies an auditor every action, even through the service layer', async () => {
    const runtime = await harness.boot('auditor');
    const services = createServices(runtime);
    const tenant = await activeTenant(runtime.db);
    const [person] = await runtime.db.user_access.toArray();
    const [subscription] = await runtime.db.subscriptions.toArray();
    await expect(
      services.tenants.suspend(tenant.id, { reason: 'Testing access' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.users.setDisabled(person?.id ?? '', true)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(
      services.impersonation.start(person?.id ?? '', { reason: 'Testing access' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.subscriptions.cancel(subscription?.id ?? '')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await userEvents(runtime.db)).toEqual([]);
  });

  it('a support agent may impersonate but not suspend; billing is owner-only', async () => {
    const agent = await harness.boot('support-agent');
    const services = createServices(agent);
    const tenant = await activeTenant(agent.db);
    await expect(
      services.tenants.suspend(tenant.id, { reason: 'Not my call' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    const owner = await harness.boot('incident'); // support lead (admin)
    const sub = (await owner.db.subscriptions.toArray()).find((s) => s.status === 'active');
    await expect(createServices(owner).subscriptions.cancel(sub?.id ?? '')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });

  it('impersonation switches the acting persona, is audited, survives reload and stops back to staff', async () => {
    let runtime = await harness.boot('support-agent');
    let services = createServices(runtime);
    const person = (await runtime.db.user_access.toArray()).find((a) => !a.disabled);
    if (!person) throw new Error('fixture has no enabled tenant person');

    await services.impersonation.start(person.id, { reason: 'Reproduce a billing bug' });
    expect(runtime.session.principal()).toMatchObject({
      persona: { id: person.id },
      organization: { id: person.tenantId },
    });
    expect(runtime.session.can('console:read')).toBe(false);
    await expect(
      services.impersonation.start(person.id, { reason: 'Second one' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect(await services.impersonation.current()).toMatchObject({
      staffId: 'user_0003',
      targetId: person.id,
    });
    expect(runtime.session.principal()?.persona.id).toBe(person.id);

    await services.impersonation.stop();
    expect(runtime.session.principal()).toMatchObject({
      persona: { id: 'user_0003' },
      organization: { id: 'org_0001' },
    });
    expect(await services.impersonation.current()).toBeUndefined();
    const audit = await userEvents(runtime.db);
    expect(audit.map((e) => e.type).sort()).toEqual([
      'impersonation.ended',
      'impersonation.started',
    ]);
    expect(audit.find((e) => e.type === 'impersonation.started')?.payload.reason).toBe(
      'Reproduce a billing bug'
    );
    expect(audit.every((e) => e.actorId === 'user_0003')).toBe(true);
  });

  it('stop works offline; starting while offline writes nothing', async () => {
    const runtime = await harness.boot('operations');
    const services = createServices(runtime);
    const person = (await runtime.db.user_access.toArray()).find((a) => !a.disabled);
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.impersonation.start(person?.id ?? '', { reason: 'Offline attempt' })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect(await services.impersonation.current()).toBeUndefined();
    await runtime.overrides.set({ environment: { network: 'online' } });
    await services.impersonation.start(person?.id ?? '', { reason: 'Online attempt' });
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await services.impersonation.stop();
    expect(runtime.session.principal()?.persona.id).toBe('user_0001');
  });

  it('disables and re-enables a user, refuses to impersonate a disabled one, and schedules cancellation', async () => {
    const runtime = await harness.boot('operations');
    const services = createServices(runtime);
    const person = (await runtime.db.user_access.toArray()).find((a) => !a.disabled);
    await services.users.setDisabled(person?.id ?? '', true);
    await expect(
      services.impersonation.start(person?.id ?? '', { reason: 'Disabled person' })
    ).rejects.toThrow(/disabled/);
    await services.users.setDisabled(person?.id ?? '', false);
    const sub = (await runtime.db.subscriptions.toArray()).find(
      (s) => s.status === 'active' && !s.cancelAtPeriodEnd
    );
    expect((await services.subscriptions.cancel(sub?.id ?? '')).cancelAtPeriodEnd).toBe(true);
    expect((await services.subscriptions.resume(sub?.id ?? '')).cancelAtPeriodEnd).toBe(false);
    // Entries made at the same simulated instant have no defined order: compare as sets.
    expect((await userEvents(runtime.db)).map((e) => e.type).sort()).toEqual([
      'subscription.cancel_scheduled',
      'subscription.resumed',
      'user.disabled',
      'user.enabled',
    ]);
  });
});

describe('admin console UI', () => {
  it('renders the manifest default through LayoutHost', async () => {
    const runtime = await harness.boot('operations');
    const { container } = render(AppHost, { runtime });
    await waitFor(() => expect(container.querySelector('[data-py-layout="sidebar"]')).toBeTruthy());
    expect(container.querySelector('[data-py-layout-host]')?.getAttribute('data-layout')).toBe(
      'sidebar'
    );
  });

  it('labels impersonation clearly and returns to the console on stop', async () => {
    const runtime = await harness.boot('support-agent');
    const person = (await runtime.db.user_access.toArray()).find((a) => !a.disabled);
    await createServices(runtime).impersonation.start(person?.id ?? '', {
      reason: 'Reproduce a bug',
    });
    const name = runtime.session.principal()?.persona.name ?? '';

    render(AppHost, { runtime });
    const banner = await screen.findByTestId('impersonation-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain(`Impersonating ${name}`);
    expect(banner.textContent).toContain('Sam Patel');
    expect(banner.textContent).toMatch(/Simulated session, every action is\s+audited/);
    expect(screen.getByTestId('impersonated-view')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();

    await fireEvent.click(within(banner).getByRole('button', { name: 'Stop impersonating' }));
    await waitFor(() => expect(screen.queryByTestId('impersonation-banner')).toBeNull());
    expect(runtime.session.principal()?.persona.id).toBe('user_0003');
  });

  it('suspends a tenant from its page only after a confirmed reason', async () => {
    const runtime = await harness.boot('operations');
    const tenant = await activeTenant(runtime.db);
    location.hash = `#/tenants/${tenant.id}`;
    render(AppHost, { runtime });
    await fireEvent.click(await screen.findByRole('button', { name: 'Suspend tenant' }));
    const dialog = await screen.findByRole('dialog');
    await fireEvent.input(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'Abuse report' },
    });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend tenant' }));
    await waitFor(async () =>
      expect((await runtime.db.tenants.get(tenant.id))?.status).toBe('suspended')
    );
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeTruthy();
  });

  it('hides every action from an auditor', async () => {
    const runtime = await harness.boot('auditor');
    const tenant = await activeTenant(runtime.db);
    location.hash = `#/tenants/${tenant.id}`;
    render(AppHost, { runtime });
    await screen.findByRole('heading', { name: tenant.name });
    expect(screen.queryByRole('button', { name: 'Suspend tenant' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Impersonate/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Disable/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).toBeNull();
  });
});
