import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

export type AccountType = 'checking' | 'savings';
export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: 'USD';
  openingBalanceCents: number;
  balanceCents: number;
  ownerId: string;
  createdAt: string;
};

export type TransactionType = 'income' | 'expense' | 'transfer';
export type Transaction = {
  id: string;
  accountId: string;
  relatedAccountId: string | null;
  type: TransactionType;
  direction: 'in' | 'out' | null;
  category: string;
  description: string;
  /** Positive integer cents; direction/type determine the ledger effect. */
  amountCents: number;
  occurredAt: string;
};

export type Budget = {
  id: string;
  category: string;
  limitCents: number;
  alertAtCents: number;
  period: 'monthly';
};

export type BalanceSnapshot = {
  id: string;
  accountId: string;
  at: string;
  balanceCents: number;
};

export type FintechDatabase = Dexie & {
  accounts: EntityTable<Account, 'id'>;
  transactions: EntityTable<Transaction, 'id'>;
  budgets: EntityTable<Budget, 'id'>;
  balanceSnapshots: EntityTable<BalanceSnapshot, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        accounts: 'id, type, ownerId',
        transactions:
          'id, accountId, relatedAccountId, type, category, occurredAt, [accountId+occurredAt]',
        budgets: 'id, category',
        balanceSnapshots: 'id, accountId, at, [accountId+at]',
      },
    },
  ],
};
