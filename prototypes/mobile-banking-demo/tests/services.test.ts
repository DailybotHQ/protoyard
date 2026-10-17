import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { BankDatabase } from '../src/database/schema.ts';
import { createBankServices, ledgerIsBalanced, TransferError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<BankDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<BankDatabase>(definition);
});

describe('mobile-banking-demo on the real runtime', () => {
  it('transfers atomically between own accounts and the ledger stays balanced after reload', async () => {
    let runtime = await harness.boot('active-customer');
    const bank = createBankServices(runtime);
    const checking = await runtime.db.accounts.get('acct_checking');
    const savings = await runtime.db.accounts.get('acct_savings');
    if (!checking || !savings) throw new Error('accounts');

    await bank.transfer({
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amount: 125.5,
      memo: 'Trip fund',
    });
    runtime = await harness.reload(runtime);
    expect((await runtime.db.accounts.get(checking.id))?.balanceCents).toBe(
      checking.balanceCents - 12_550
    );
    expect((await runtime.db.accounts.get(savings.id))?.balanceCents).toBe(
      savings.balanceCents + 12_550
    );
    expect(await runtime.db.transfers.count()).toBe(1);
    expect(await ledgerIsBalanced(runtime.db)).toBe(true);
  });

  it('rejects insufficient funds and leaves every balance untouched', async () => {
    const runtime = await harness.boot('low-balance');
    const bank = createBankServices(runtime);
    const before = await runtime.db.accounts.orderBy('id').toArray();
    const payee = (await runtime.db.beneficiaries.toArray())[0];
    await expect(
      bank.transfer({
        fromAccountId: 'acct_checking',
        beneficiaryId: payee?.id ?? null,
        amount: 500,
      })
    ).rejects.toMatchObject({ code: 'insufficient-funds' });
    expect(await runtime.db.accounts.orderBy('id').toArray()).toEqual(before);
    expect(await runtime.db.transfers.count()).toBe(0);
  });

  it('blocks locked accounts, the viewer role, and members above their cap', async () => {
    const runtime = await harness.boot('locked-account');
    const bank = createBankServices(runtime);
    await expect(
      bank.transfer({ fromAccountId: 'acct_checking', toAccountId: 'acct_savings', amount: 10 })
    ).rejects.toBeInstanceOf(TransferError);

    await runtime.scenarios.load('active-customer');
    await runtime.session.switchActor('user_0003');
    await expect(
      bank.transfer({ fromAccountId: 'acct_checking', toAccountId: 'acct_savings', amount: 10 })
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0002');
    await expect(
      bank.transfer({ fromAccountId: 'acct_checking', toAccountId: 'acct_savings', amount: 900 })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      bank.transfer({ fromAccountId: 'acct_checking', toAccountId: 'acct_savings', amount: 50 })
    ).resolves.toMatchObject({ status: 'completed' });
  });

  it('fails clearly offline without writing anything', async () => {
    const runtime = await harness.boot('offline-mode');
    const bank = createBankServices(runtime);
    await expect(
      bank.transfer({ fromAccountId: 'acct_checking', toAccountId: 'acct_savings', amount: 5 })
    ).rejects.toMatchObject({ code: 'offline' });
    expect(await runtime.db.transfers.count()).toBe(0);
  });
});
