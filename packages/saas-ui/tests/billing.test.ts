import { definePrototype, type PrototypeDefinition, parseManifest } from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import { type BillingService, createBilling, saasStores, saasTables } from '@protoyard/saas';
import { generateTeam } from '@protoyard/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { daysUntil, formatCents } from '../src/lib/money.ts';
import ProvideBillingHarness from './fixtures/ProvideBillingHarness.svelte';

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
const CATALOG = [
  { id: 'starter', name: 'Starter', unitAmountCents: 10_000, interval: 'month' as const },
  { id: 'pro', name: 'Pro', unitAmountCents: 20_000, interval: 'month' as const },
];

function definition(namespace: string): PrototypeDefinition {
  return definePrototype({
    manifest: parseManifest({
      id: `example.${namespace}`,
      slug: namespace,
      name: 'Billing UI fixture',
      version: '0.1.0',
      defaultScenario: 'active-month',
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
  });
}

const open: ProtoyardRuntime[] = [];
afterEach(() => {
  cleanup();
  location.hash = '';
  for (const runtime of open.splice(0)) runtime.close();
});

async function boot(namespace: string): Promise<{
  runtime: ProtoyardRuntime;
  billing: BillingService;
}> {
  const runtime = await createPrototypeRuntime(definition(namespace), {
    indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
    IDBKeyRange,
    sleep: async () => {},
  });
  open.push(runtime);
  await runtime.scenarios.ensureSeeded();
  const billing = createBilling(runtime, CATALOG);
  return { runtime, billing };
}

describe('billing money helpers', () => {
  it('formats integer cents and counts trial days from the simulated clock', () => {
    expect(formatCents(10_000, 'USD')).toMatch(/\$100\.00/);
    expect(formatCents(99, 'USD')).toMatch(/\$0\.99/);
    const now = Date.parse(REFERENCE_TIME);
    expect(daysUntil('2026-06-15T09:00:00.000Z', now)).toBe(14);
    expect(daysUntil('2026-06-01T09:00:00.000Z', now)).toBe(0);
    expect(daysUntil(null, now)).toBeNull();
  });
});

describe('billing UI', () => {
  it('lists plans with prices from integer cents', async () => {
    const { runtime, billing } = await boot('billing-ui-plans');
    render(ProvideBillingHarness, { props: { runtime, billing, screen: 'plans' } });
    expect(await screen.findByRole('heading', { name: 'Plans' })).toBeTruthy();
    expect(screen.getByTestId('plan-card-starter')).toBeTruthy();
    expect(screen.getByTestId('plan-card-pro').textContent).toMatch(/\$200\.00/);
    expect(screen.getByRole('link', { name: 'Choose Pro' }).getAttribute('href')).toBe(
      '#/billing/checkout?plan=pro'
    );
  });

  it('upgrades through checkout and shows a simulated success result', async () => {
    const { runtime, billing } = await boot('billing-ui-upgrade');
    await billing.startTrial({ planId: 'starter' });
    render(ProvideBillingHarness, {
      props: {
        runtime,
        billing,
        screen: 'checkout',
        showOutcomePicker: true,
        planId: 'pro',
      },
    });
    await screen.findByTestId('checkout-plan');
    expect(screen.getByTestId('checkout-disclaimer').textContent).toMatch(/no card, no charge/i);
    expect(screen.getByTestId('checkout-outcome-picker')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Confirm simulated payment' }));
    const result = await screen.findByTestId('checkout-result');
    expect(result.getAttribute('data-outcome')).toBe('success');
    expect(result.textContent).toMatch(/pro/i);
    expect((await billing.subscription())?.planId).toBe('pro');
  });

  it('records a declined checkout without activating the paid plan', async () => {
    const { runtime, billing } = await boot('billing-ui-decline');
    await billing.startTrial({ planId: 'starter' });
    render(ProvideBillingHarness, {
      props: {
        runtime,
        billing,
        screen: 'checkout',
        showOutcomePicker: true,
        planId: 'pro',
      },
    });
    await screen.findByTestId('checkout-outcome-picker');
    await fireEvent.click(screen.getByRole('radio', { name: 'Declined' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm simulated payment' }));
    const result = await screen.findByTestId('checkout-result');
    expect(result.getAttribute('data-outcome')).toBe('declined');
    expect((await billing.subscription())?.planId).toBe('starter');
  });

  it('cancels and resumes from the billing portal', async () => {
    const { runtime, billing } = await boot('billing-ui-cancel');
    await billing.startTrial({ planId: 'starter' });
    await billing.checkout({ planId: 'starter', outcome: 'success' });
    expect((await billing.subscription())?.status).toBe('active');

    render(ProvideBillingHarness, { props: { runtime, billing, screen: 'portal' } });
    await screen.findByTestId('portal-seats');
    expect(screen.getByTestId('portal-seats').textContent).toMatch(/\d+/);

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel at period end' }));
    await screen.findByRole('button', { name: 'Resume subscription' });
    expect((await billing.subscription())?.cancelAtPeriodEnd).toBe(true);
    expect(screen.getByText(/Cancels at period end/i)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Resume subscription' }));
    await waitFor(async () => {
      const sub = await billing.subscription();
      expect(sub?.cancelAtPeriodEnd).toBe(false);
    });
    await screen.findByRole('button', { name: 'Cancel at period end' });
  });

  it('shows a trial banner countdown from the simulated clock', async () => {
    const { runtime, billing } = await boot('billing-ui-trial');
    await billing.startTrial({ planId: 'starter', trialDays: 14 });
    render(ProvideBillingHarness, { props: { runtime, billing, screen: 'banner' } });
    const banner = await screen.findByTestId('trial-banner');
    expect(banner.textContent).toMatch(/14 days/i);
    expect(banner.textContent).toMatch(/Starter/);

    // Preview the clock 10 days forward → 4 days left on a 14-day trial.
    runtime.clock.preview({ days: 10 });
    cleanup();
    render(ProvideBillingHarness, {
      props: { runtime, billing, screen: 'banner', refreshKey: 1 },
    });
    const updated = await screen.findByTestId('trial-banner');
    expect(updated.textContent).toMatch(/4 days/i);
  });
});
