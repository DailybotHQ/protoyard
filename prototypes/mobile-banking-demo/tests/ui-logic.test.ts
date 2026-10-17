import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { BankDatabase, Transaction } from '../src/database/schema.ts';
import { createBankServices, ledgerIsBalanced, TransferError } from '../src/domain/services.ts';
import {
  groupByMonth,
  matchesFilter,
  sortAccounts,
  spendingByCategory,
  totalBalance,
} from '../src/lib/derive.ts';
import { describeError } from '../src/lib/errors.ts';
import { formatDay, parseAmount } from '../src/lib/format.ts';
import { createBankSimulations, PAYROLL_CENTS } from '../src/lib/simulations.ts';
import { definition } from '../src/prototype.ts';

const NOW = new Date('2026-10-16T15:00:00.000Z');
const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'txn_x',
  accountId: 'acct_checking',
  amountCents: -1_000,
  description: 'Coffee',
  merchant: 'Café Lumière',
  category: 'dining',
  status: 'posted',
  transferId: null,
  at: '2026-10-10T10:00:00.000Z',
  ...over,
});

describe('read models', () => {
  it('sums spending by category over the window, excluding transfers and income', () => {
    const rows = [
      tx({ id: 'a', amountCents: -2_000 }),
      tx({ id: 'b', amountCents: -500, status: 'pending' }),
      tx({ id: 'c', amountCents: -9_999, category: 'transfer' }),
      tx({ id: 'd', amountCents: 50_000, category: 'salary' }),
      tx({ id: 'e', amountCents: -7_000, category: 'groceries' }),
      tx({ id: 'f', amountCents: -1_000, at: '2026-08-01T00:00:00.000Z' }),
    ];
    expect(spendingByCategory(rows, NOW)).toEqual([
      { category: 'groceries', cents: 7_000, ratio: 1 },
      { category: 'dining', cents: 2_500, ratio: 2_500 / 7_000 },
    ]);
    expect(spendingByCategory([], NOW)).toEqual([]);
  });

  it('groups by month in order and nets posted rows only', () => {
    const groups = groupByMonth([
      tx({ id: '1', at: '2026-10-02T00:00:00Z', amountCents: -100 }),
      tx({ id: '2', at: '2026-10-01T00:00:00Z', amountCents: -50, status: 'pending' }),
      tx({ id: '3', at: '2026-09-30T00:00:00Z', amountCents: 400 }),
    ]);
    expect(groups.map((g) => [g.key, g.items.length, g.netCents])).toEqual([
      ['2026-10', 2, -100],
      ['2026-09', 1, 400],
    ]);
  });

  it('filters by account, category, direction and search', () => {
    const row = tx({});
    expect(matchesFilter(row, { search: 'lumi' })).toBe(true);
    expect(matchesFilter(row, { direction: 'in' })).toBe(false);
    expect(matchesFilter(row, { category: 'groceries' })).toBe(false);
    expect(matchesFilter(row, { accountId: 'acct_savings' })).toBe(false);
  });

  it('parses typed amounts strictly and formats relative days', () => {
    expect(parseAmount('$1,250.5')).toBe(1250.5);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(formatDay('2026-10-16T01:00:00Z', NOW)).toBe('Today');
    expect(formatDay('2026-10-15T23:00:00Z', NOW)).toBe('Yesterday');
    expect(formatDay('2026-10-03T12:00:00Z', NOW)).toBe('Oct 3');
  });
});

describe('error descriptions', () => {
  it('maps every failure family to customer language', () => {
    expect(
      describeError(new TransferError('insufficient-funds', 'Not enough funds.'))
    ).toMatchObject({
      title: 'Not enough money',
      hint: expect.stringMatching(/smaller amount/),
    });
    expect(describeError(new PermissionDeniedError('transfers:create', 'member')).title).toBe(
      'Above your limit'
    );
    expect(describeError(new PermissionDeniedError('transfers:create', 'viewer')).title).toBe(
      'View-only access'
    );
    expect(describeError(new SimulatedServiceError('offline', 'transfers.create')).title).toBe(
      'You are offline'
    );
    expect(describeError(new Error('boom'))).toEqual({
      title: 'Something went wrong',
      message: 'boom',
    });
  });
});

describe('on the real runtime', () => {
  let harness = createHarness<BankDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<BankDatabase>(definition);
  });

  it('simulated payroll writes a real, balanced ledger row that survives reload', async () => {
    let runtime = await harness.boot('new-account');
    expect(totalBalance(await runtime.db.accounts.toArray())).toBe(0);
    const row = await createBankSimulations(runtime).simulatePayroll('acct_checking');
    expect(row).toMatchObject({ amountCents: PAYROLL_CENTS, category: 'salary', status: 'posted' });
    runtime = await harness.reload(runtime);
    expect((await runtime.db.accounts.get('acct_checking'))?.balanceCents).toBe(PAYROLL_CENTS);
    expect(await ledgerIsBalanced(runtime.db)).toBe(true);
  });

  it('payroll respects roles, account status and the offline environment', async () => {
    const runtime = await harness.boot('locked-account');
    const sims = createBankSimulations(runtime);
    await expect(sims.simulatePayroll('acct_checking')).rejects.toMatchObject({
      code: 'account-locked',
    });
    await runtime.scenarios.load('dependent-view');
    await expect(sims.simulatePayroll('acct_checking')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await runtime.scenarios.load('offline-mode');
    await expect(sims.simulatePayroll('acct_checking')).rejects.toMatchObject({ code: 'offline' });
    expect(await ledgerIsBalanced(runtime.db)).toBe(true);
  });

  it('rejects transfers that round to zero cents without writing anything', async () => {
    const runtime = await harness.boot('active-customer');
    const bank = createBankServices(runtime);
    await expect(
      bank.transfer({ fromAccountId: 'acct_checking', toAccountId: 'acct_savings', amount: 0.004 })
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await runtime.db.transfers.count()).toBe(0);
  });

  it('orders accounts checking → savings → credit', async () => {
    const runtime = await harness.boot('active-customer');
    expect(sortAccounts(await runtime.db.accounts.toArray()).map((a) => a.type)).toEqual([
      'checking',
      'savings',
      'credit',
    ]);
  });
});
