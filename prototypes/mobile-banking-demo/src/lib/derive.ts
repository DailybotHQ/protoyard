import { MS_PER_DAY } from '@protoyard/core';
import type { Account, Category, Transaction } from '../database/schema.ts';

/**
 * Pure read-model helpers. Every number on screen comes from these over real
 * rows — nothing is hard-coded — so they are unit tested directly.
 */

export interface CategorySpend {
  category: Category;
  cents: number;
  /** Share of the largest category, 0..1 (for bar widths). */
  ratio: number;
}

/**
 * Money that left the household over the last `days` simulated days, by
 * category. Transfers are excluded (moving money between own accounts or to
 * people is not "spending"); pending authorisations are included because
 * the money is already committed.
 */
export function spendingByCategory(
  transactions: readonly Transaction[],
  now: Date,
  days = 30
): CategorySpend[] {
  const from = now.getTime() - days * MS_PER_DAY;
  const totals = new Map<Category, number>();
  for (const t of transactions) {
    const at = Date.parse(t.at);
    if (t.amountCents >= 0 || t.category === 'transfer' || at <= from || at > now.getTime()) {
      continue;
    }
    totals.set(t.category, (totals.get(t.category) ?? 0) - t.amountCents);
  }
  const max = Math.max(0, ...totals.values());
  return [...totals.entries()]
    .map(([category, cents]) => ({ category, cents, ratio: max ? cents / max : 0 }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
}

/**
 * Net position across accounts: deposits minus what is owed on credit.
 * Credit balances are already negative in the ledger.
 */
export const totalBalance = (accounts: readonly Account[]) =>
  accounts.reduce((sum, account) => sum + account.balanceCents, 0);

export interface MonthGroup<T> {
  /** `YYYY-MM` */
  key: string;
  items: T[];
  /** Sum of posted amounts in the group. */
  netCents: number;
}

/** Groups rows (already sorted newest first) by calendar month, keeping order. */
export function groupByMonth(transactions: readonly Transaction[]): MonthGroup<Transaction>[] {
  const groups: MonthGroup<Transaction>[] = [];
  for (const t of transactions) {
    const key = t.at.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, items: [], netCents: 0 };
      groups.push(group);
    }
    group.items.push(t);
    if (t.status === 'posted') group.netCents += t.amountCents;
  }
  return groups;
}

export type Direction = 'all' | 'in' | 'out';

export interface TransactionFilter {
  accountId?: string;
  category?: Category | '';
  direction?: Direction;
  search?: string;
}

export function matchesFilter(t: Transaction, filter: TransactionFilter): boolean {
  if (filter.accountId && t.accountId !== filter.accountId) return false;
  if (filter.category && t.category !== filter.category) return false;
  if (filter.direction === 'in' && t.amountCents <= 0) return false;
  if (filter.direction === 'out' && t.amountCents >= 0) return false;
  const query = filter.search?.trim().toLowerCase();
  if (query) {
    const haystack = `${t.description} ${t.merchant}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

/** Accounts money can leave from right now. */
export const usableAccounts = (accounts: readonly Account[]) =>
  accounts.filter((a) => a.status === 'active');

const TYPE_ORDER: Record<Account['type'], number> = { checking: 0, savings: 1, credit: 2 };

/** Checking first, then savings, then cards — how people scan their accounts. */
export const sortAccounts = (accounts: readonly Account[]) =>
  [...accounts].sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name)
  );
