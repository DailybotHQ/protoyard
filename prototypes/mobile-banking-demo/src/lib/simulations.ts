import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type { BankDatabase, Transaction } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { TransferError } from '../domain/services.ts';
import { PAYROLL_CENTS } from '../domain/timeline.ts';

/**
 * Demo-only money sources. A fictional bank has no real income, so a brand-new
 * account needs a way to get funds that still follows the ledger rules: one
 * transaction writes the credit row AND the balance, so
 * `balance == sum(posted transactions)` keeps holding.
 */

export { PAYROLL_CENTS } from '../domain/timeline.ts';

export function createBankSimulations(runtime: PrototypeRuntime<BankDatabase>) {
  const { db, session, environment, clock } = runtime;

  return {
    /** Credits a (fictional) payroll deposit to an account the household can use. */
    async simulatePayroll(accountId: string, amountCents = PAYROLL_CENTS): Promise<Transaction> {
      session.assert(CAPABILITIES.transfersCreate);
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new TransferError('invalid', 'Deposit amount must be a positive number of cents.');
      }
      return environment.run('deposits.payroll', () =>
        db.transaction('rw', db.accounts, db.transactions, async () => {
          const account = await db.accounts.get(accountId);
          if (!account) throw new TransferError('not-found', 'Account not found.');
          if (account.status !== 'active') {
            throw new TransferError(
              account.status === 'locked' ? 'account-locked' : 'account-dormant',
              `${account.name} is ${account.status}; deposits are paused.`
            );
          }
          const row: Transaction = {
            id: createRuntimeId('txn'),
            accountId,
            amountCents,
            description: 'Payroll deposit (simulated)',
            merchant: 'Brightpath Studio payroll',
            category: 'salary',
            status: 'posted',
            transferId: null,
            at: clock.now().toISOString(),
          };
          await db.transactions.add(row);
          await db.accounts.update(accountId, { balanceCents: account.balanceCents + amountCents });
          return row;
        })
      );
    },
  };
}

export type BankSimulations = ReturnType<typeof createBankSimulations>;
