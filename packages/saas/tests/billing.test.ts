import { definePrototype, type PrototypeDefinition, parseManifest } from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam } from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { type BillingService, billingTimeline, createBilling } from '../src/billing.ts';
import { type SaasInvoice, type SaasSubscription, saasStores, saasTables } from '../src/schema.ts';

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
const CATALOG = [
  { id: 'starter', name: 'Starter', unitAmountCents: 10_000, interval: 'month' as const },
  { id: 'pro', name: 'Pro', unitAmountCents: 20_000, interval: 'month' as const },
  { id: 'annual', name: 'Annual', unitAmountCents: 180_000, interval: 'year' as const },
];

function definition(namespace: string): PrototypeDefinition {
  return definePrototype({
    manifest: parseManifest({
      id: `example.${namespace}`,
      slug: namespace,
      name: 'Billing simulator fixture',
      version: '0.1.0',
      defaultScenario: 'active-month',
      defaultTheme: 'violet',
      storage: { namespace, schemaVersion: 2 },
      scenarios: ['active-month'],
    }),
    database: {
      versions: [
        { version: 1, stores: { projects: 'id' } },
        { version: 2, stores: saasStores() },
      ],
    },
    scenarios: [
      {
        id: 'active-month',
        extends: 'active-month',
        name: 'Active month',
        seed: 42,
        referenceTime: REFERENCE_TIME,
      },
    ],
    generate(ctx) {
      const team = generateTeam(ctx);
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: saasTables(),
      };
    },
    timeline: billingTimeline,
    applyEvent: async (event, context) => {
      const service = services.get(namespace);
      if (service) await service.applyTimelineEvent(event, context);
    },
  });
}

const services = new Map<string, BillingService>();
const open: ProtoyardRuntime[] = [];
afterEach(() => {
  services.clear();
  for (const runtime of open.splice(0)) runtime.close();
});

async function boot(namespace: string) {
  const proto = definition(namespace);
  const runtime = await createPrototypeRuntime(proto, {
    indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
    IDBKeyRange,
    sleep: async () => {},
  });
  open.push(runtime);
  await runtime.scenarios.ensureSeeded();
  const billing = createBilling(runtime, CATALOG);
  services.set(namespace, billing);
  return { runtime, billing };
}

describe('createBilling', () => {
  it('starts a trial and expires it with one deterministic advance event and inbox email', async () => {
    const { runtime, billing } = await boot('billing-trial-expiry');
    const trial = await billing.startTrial({ planId: 'starter' });
    expect(trial.trialEndsAt).toBe('2026-06-15T09:00:00.000Z');
    expect(runtime.session.principal()?.organization).toMatchObject({
      plan: 'starter',
      billingStatus: 'trialing',
      trialEndsAt: trial.trialEndsAt,
    });

    const firstAdvance = await runtime.scenarios.advance({ days: 14 });
    expect(firstAdvance).toEqual({ applied: 1, skipped: 0 });
    expect(
      await runtime.db.rows<SaasSubscription>('saas_subscriptions').get(trial.id)
    ).toMatchObject({
      status: 'expired',
    });
    expect(runtime.session.principal()?.organization?.billingStatus).toBe('expired');
    const messages = await runtime.db
      .rows<{ id: string; kind: string; at: string }>('saas_inbox')
      .where('kind')
      .equals('trial')
      .toArray();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.at).toBe(trial.trialEndsAt);
    expect(messages[0]?.id).toBe('inbox:evt:active-month:2026-06-15:0');

    expect(await runtime.db.table('py_events').get('evt:active-month:2026-06-15:0')).toMatchObject({
      type: 'saas.billing.trial-expired',
      source: 'timeline',
    });
  });

  it('records a declined checkout attempt without changing the organization or subscription', async () => {
    const { runtime, billing } = await boot('billing-declined');
    const trial = await billing.startTrial({ planId: 'starter' });
    const result = await billing.checkout({ planId: 'pro', outcome: 'declined' });

    expect(result).toMatchObject({ outcome: 'declined', subscription: { id: trial.id } });
    expect(result.invoice.status).toBe('failed');
    expect(await billing.invoices()).toEqual([result.invoice]);
    expect(await runtime.db.rows<SaasSubscription>('saas_subscriptions').get(trial.id)).toEqual(
      trial
    );
    expect(runtime.session.principal()?.organization).toMatchObject({
      plan: 'starter',
      billingStatus: 'trialing',
    });
    expect(await runtime.db.rows('saas_inbox').count()).toBe(0);
  });

  it('keeps a checkout requiring simulated action pending without activating the plan', async () => {
    const { runtime, billing } = await boot('billing-requires-action');
    const trial = await billing.startTrial({ planId: 'starter' });
    const result = await billing.checkout({ planId: 'pro', outcome: 'requires-action' });

    expect(result.outcome).toBe('requires-action');
    expect(result.invoice.status).toBe('open');
    expect(await runtime.db.rows<SaasSubscription>('saas_subscriptions').get(trial.id)).toEqual(
      trial
    );
    expect(runtime.session.principal()?.organization?.billingStatus).toBe('trialing');
  });

  it('converts a trial into a paid period without charging against the free trial window', async () => {
    const { runtime, billing } = await boot('billing-trial-conversion');
    await billing.startTrial({ planId: 'starter' });
    const result = await billing.checkout({ planId: 'pro' });

    expect(result.invoice.amountCents).toBe(20_000 * (result.subscription?.seats ?? 1));
    expect(result.subscription).toMatchObject({
      status: 'active',
      trialEndsAt: null,
      currentPeriodStart: REFERENCE_TIME,
      currentPeriodEnd: '2026-07-01T09:00:00.000Z',
    });
    expect(await runtime.scenarios.advance({ days: 14 })).toEqual({ applied: 0, skipped: 0 });
    expect(runtime.session.principal()?.organization?.billingStatus).toBe('active');
  });

  it('prorates an upgrade in integer cents and sends a simulated receipt', async () => {
    const { runtime, billing } = await boot('billing-proration');
    const initial = await billing.checkout({ planId: 'starter' });
    const seats = initial.subscription?.seats ?? 1;
    await runtime.scenarios.advance({ days: 15 });

    const result = await billing.upgrade({ planId: 'pro' });
    expect(result.outcome).toBe('success');
    expect(result.invoice.amountCents).toBe(5_000 * seats);
    expect(result.invoice.lines).toEqual([
      { description: 'Unused starter plan time', amountCents: -5_000 * seats },
      { description: 'Remaining pro plan time', amountCents: 10_000 * seats },
    ]);
    const downgrade = await billing.downgrade({ planId: 'starter' });
    expect(downgrade.invoice.amountCents).toBe(-5_000 * seats);
    expect(downgrade.invoice.lines).toEqual([
      { description: 'Unused pro plan time', amountCents: -10_000 * seats },
      { description: 'Remaining starter plan time', amountCents: 5_000 * seats },
    ]);
    expect(await runtime.db.rows<SaasInvoice>('saas_invoices').count()).toBe(3);
    expect(await runtime.db.rows<{ id: string; kind: string }>('saas_inbox').count()).toBe(2);
    expect((await billing.subscription())?.planId).toBe('starter');
  });

  it('supports scheduled cancellation and resuming before the period ends', async () => {
    const { billing } = await boot('billing-cancel-resume');
    await billing.checkout({ planId: 'starter' });
    expect((await billing.cancel()).cancelAtPeriodEnd).toBe(true);
    expect((await billing.resume()).cancelAtPeriodEnd).toBe(false);
  });
});
