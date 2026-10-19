import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Lumen Bank (FICTIONAL). Money is stored as integer cents — never floats —
 * so the ledger always balances. Every balance change is a ledger row, and
 * `accounts.balanceCents` equals the sum of its posted transactions.
 *
 * Nothing here is real: no bank, routing or card numbers. Account numbers are
 * masked display strings generated from the scenario seed.
 */

export type AccountType = 'checking' | 'savings' | 'credit';
export type AccountStatus = 'active' | 'locked' | 'dormant';

export interface Account {
  id: string;
  ownerId: string;
  name: string;
  type: AccountType;
  /** Display only, e.g. "•••• 4821". */
  masked: string;
  balanceCents: number;
  currency: 'USD';
  status: AccountStatus;
  /** Per-transfer cap enforced by the transfer service. */
  dailyLimitCents: number;
  openedAt: string;
}

export const CATEGORIES = [
  'groceries',
  'dining',
  'transport',
  'shopping',
  'utilities',
  'rent',
  'salary',
  'transfer',
  'entertainment',
  'health',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Transaction {
  id: string;
  accountId: string;
  /** Signed: negative = money out. */
  amountCents: number;
  description: string;
  merchant: string;
  category: Category;
  status: 'posted' | 'pending';
  transferId: string | null;
  at: string;
}

export interface Beneficiary {
  id: string;
  ownerId: string;
  name: string;
  nickname: string;
  /** Fictional institution name + masked number, display only. */
  institution: string;
  masked: string;
  /**
   * Library avatar id (`av-NNN`) for seeded person payees; resolve it with
   * `avatarImage`. Businesses and payees added in the app show initials.
   */
  avatar?: string;
  createdAt: string;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  /** Internal transfer target, or null when sent to a beneficiary. */
  toAccountId: string | null;
  beneficiaryId: string | null;
  amountCents: number;
  memo: string;
  status: 'completed' | 'failed';
  createdBy: string;
  at: string;
}

export type BankDatabase = Dexie & {
  accounts: EntityTable<Account, 'id'>;
  transactions: EntityTable<Transaction, 'id'>;
  beneficiaries: EntityTable<Beneficiary, 'id'>;
  transfers: EntityTable<Transfer, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        accounts: 'id, ownerId, type, status',
        transactions: 'id, accountId, at, category, transferId, [accountId+at]',
        beneficiaries: 'id, ownerId, name',
        transfers: 'id, fromAccountId, toAccountId, beneficiaryId, at',
      },
    },
  ],
};

export const formatMoney = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
