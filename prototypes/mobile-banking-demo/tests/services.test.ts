import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { BankDatabase } from '../src/database/schema.ts';
import { createBankServices, ledgerIsBalanced, TransferError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<BankDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<BankDatabase>(definition);
});

describe('mobile-banking-demo on the real runtime', () => {
  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
  });

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
});

describe('Lumen Bank timeline determinism', () => {
  it('7 × 1 day equals 1 × 7 days, keeps the ledger balanced and replays apply nothing', async () => {
    const other = createHarness<BankDatabase>(definition);
    try {
      const world = async (db: BankDatabase) => ({
        accounts: await db.accounts.orderBy('id').toArray(),
        transactions: await db.transactions.orderBy('id').toArray(),
      });
      const a = await harness.boot('active-customer');
      const b = await other.boot('active-customer');
      let appliedA = 0;
      for (let d = 0; d < 7; d++) appliedA += (await a.scenarios.advance({ days: 1 })).applied;
      const resultB = await b.scenarios.advance({ days: 7 });
      expect(appliedA).toBeGreaterThan(7);
      expect(resultB.applied).toBe(appliedA);
      expect(await world(a.db)).toEqual(await world(b.db));
      expect(await ledgerIsBalanced(a.db)).toBe(true);

      // Rewind the committed clock and replay the same window: every event id is known.
      b.clock.setState({ ...b.clock.getState(), committedOffsetMs: 0 });
      const before = await world(b.db);
      expect(await b.scenarios.advance({ days: 7 })).toEqual({
        applied: 0,
        skipped: resultB.applied,
      });
      expect(await world(b.db)).toEqual(before);
    } finally {
      other.closeAll();
    }
  });
});
