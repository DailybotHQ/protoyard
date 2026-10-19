import type { FintechDatabase } from '../database/schema.ts';

/** The screen's IndexedDB reads, kept together so their indexes are exercised in tests. */
export function readFinances(db: FintechDatabase) {
  return Promise.all([
    readAccounts(db),
    readTransactions(db),
    readBalanceSnapshots(db),
    readBudgets(db),
  ]).then(([accounts, transactions, snapshots, budgets]) => ({
    accounts,
    transactions,
    snapshots,
    budgets,
  }));
}

export async function readAccounts(db: FintechDatabase) {
  const accounts = await db.accounts.toArray();
  return accounts.sort((left, right) => left.name.localeCompare(right.name));
}

export function readTransactions(db: FintechDatabase) {
  return db.transactions.orderBy('occurredAt').reverse().toArray();
}

export function readBalanceSnapshots(db: FintechDatabase) {
  return db.balanceSnapshots.orderBy('at').toArray();
}

export function readBudgets(db: FintechDatabase) {
  return db.budgets.orderBy('category').toArray();
}
