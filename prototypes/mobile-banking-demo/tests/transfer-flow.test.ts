import './quiet-animations.ts';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { BankDatabase } from '../src/database/schema.ts';
import { ledgerIsBalanced } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import Transfer from '../src/screens/Transfer.svelte';
import ScreenHost from './ScreenHost.svelte';

let harness = createHarness<BankDatabase>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<BankDatabase>(definition);
});

describe('Transfer screen (component flow on the real runtime)', () => {
  it('walks from → to → amount → review → receipt and moves money atomically', async () => {
    const runtime = await harness.boot('active-customer');
    const checking = await runtime.db.accounts.get('acct_checking');
    const savings = await runtime.db.accounts.get('acct_savings');
    render(ScreenHost, { runtime, screen: Transfer });

    await fireEvent.click(await screen.findByRole('button', { name: /Everyday Checking/ }));
    await fireEvent.click(await screen.findByRole('button', { name: /Rainy-day Savings/ }));
    await fireEvent.input(await screen.findByLabelText(/Amount/), { target: { value: '42.10' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    await fireEvent.click(await screen.findByRole('button', { name: /Send \$42\.10/ }));

    const reference = await screen.findByTestId('transfer-reference');
    expect(reference.textContent).toMatch(/^transfer_u/);
    expect((await runtime.db.accounts.get('acct_checking'))?.balanceCents).toBe(
      (checking?.balanceCents ?? 0) - 4_210
    );
    expect((await runtime.db.accounts.get('acct_savings'))?.balanceCents).toBe(
      (savings?.balanceCents ?? 0) + 4_210
    );
    expect(await ledgerIsBalanced(runtime.db)).toBe(true);
  });

  it('shows insufficient funds inline and writes nothing', async () => {
    const runtime = await harness.boot('low-balance');
    const payee = (await runtime.db.beneficiaries.toArray())[0];
    const before = await runtime.db.accounts.orderBy('id').toArray();
    render(ScreenHost, {
      runtime,
      screen: Transfer,
      query: `from=acct_checking&to=${payee?.id}`,
    });

    await fireEvent.input(await screen.findByLabelText(/Amount/), { target: { value: '900' } });
    expect(await screen.findByText(/more than the .* available/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    await fireEvent.click(await screen.findByRole('button', { name: /Send \$900\.00/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Not enough money/);
    expect(alert.textContent).toMatch(/No money moved/);
    expect(await runtime.db.accounts.orderBy('id').toArray()).toEqual(before);
    expect(await runtime.db.transfers.count()).toBe(0);
  });

  it('explains the joint-holder cap from the policy', async () => {
    const runtime = await harness.boot('active-customer');
    await runtime.session.switchActor('user_0002');
    render(ScreenHost, {
      runtime,
      screen: Transfer,
      query: 'from=acct_checking&to=acct_savings',
    });
    await fireEvent.input(await screen.findByLabelText(/Amount/), { target: { value: '750' } });
    expect(await screen.findByText(/Joint holders can send up to \$500\.00/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Review transfer' }));
    await fireEvent.click(await screen.findByRole('button', { name: /Send \$750\.00/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Above your limit/);
    expect(await runtime.db.transfers.count()).toBe(0);
  });

  it('gives view-only members an explanation instead of the flow', async () => {
    const runtime = await harness.boot('dependent-view');
    render(ScreenHost, { runtime, screen: Transfer });
    expect(await screen.findByText("Transfers aren't available for your access")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Everyday Checking/ })).toBeNull();
  });
});
