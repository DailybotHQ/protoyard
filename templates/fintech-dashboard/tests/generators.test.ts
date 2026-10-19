import { describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { FintechDatabase, Transaction } from '../src/database/schema.ts';
import { readFinances } from '../src/domain/queries.ts';
import { definition } from '../src/prototype.ts';
import { scenarios } from '../src/scenarios/index.ts';

function ledgerEffect(row: Transaction) {
  if (row.type === 'income' || (row.type === 'transfer' && row.direction === 'in')) {
    return row.amountCents;
  }
  return -row.amountCents;
}

describe('fintech dashboard generator', () => {
  it('runs every Money overview read against IndexedDB and sorts accounts in memory', async () => {
    const harness = createHarness<FintechDatabase>(definition);
    try {
      const runtime = await harness.boot('active');
      const overview = await readFinances(runtime.db);

      expect(overview.accounts.map((account) => account.name)).toEqual([
        'Everyday checking',
        'Rainy day savings',
      ]);
      expect(overview.transactions.length).toBeGreaterThan(0);
      expect(overview.snapshots.length).toBeGreaterThan(0);
      expect(overview.budgets).toHaveLength(5);
    } finally {
      harness.closeAll();
    }
  });

  it('repeats the account ledger, payday history and budgets for every scenario', async () => {
    for (const scenario of scenarios) {
      const harness = createHarness<FintechDatabase>(definition);
      try {
        const first = await harness.boot(scenario.id);
        const snapshot = {
          accounts: await first.db.accounts.orderBy('id').toArray(),
          transactions: await first.db.transactions.orderBy('id').toArray(),
          budgets: await first.db.budgets.orderBy('id').toArray(),
          history: await first.db.balanceSnapshots.orderBy('id').toArray(),
        };
        const personas = await first.db.table('py_personas').toArray();
        const second = await harness.boot(scenario.id);
        expect({
          accounts: await second.db.accounts.orderBy('id').toArray(),
          transactions: await second.db.transactions.orderBy('id').toArray(),
          budgets: await second.db.budgets.orderBy('id').toArray(),
          history: await second.db.balanceSnapshots.orderBy('id').toArray(),
        }).toEqual(snapshot);
        expect(snapshot.accounts).toHaveLength(2);
        expect(personas.every((persona) => /^av-\d{3}$/.test(persona.avatar ?? ''))).toBe(true);
        expect(snapshot.budgets).toHaveLength(5);
        if (scenario.id === 'active') {
          expect(
            snapshot.budgets.some((budget) => {
              const spent = snapshot.transactions
                .filter(
                  (row) =>
                    row.type === 'expense' &&
                    row.category === budget.category &&
                    row.occurredAt.slice(0, 7) === scenario.referenceTime.slice(0, 7)
                )
                .reduce((sum, row) => sum + row.amountCents, 0);
              return spent >= budget.alertAtCents;
            })
          ).toBe(true);
        }
        for (const account of snapshot.accounts) {
          const rows = snapshot.transactions.filter((row) => row.accountId === account.id);
          expect(
            account.openingBalanceCents + rows.reduce((sum, row) => sum + ledgerEffect(row), 0)
          ).toBe(account.balanceCents);
          const history = snapshot.history
            .filter((row) => row.accountId === account.id)
            .sort((a, b) => a.at.localeCompare(b.at));
          if (history.length) {
            expect(history[0]?.balanceCents).toBe(account.openingBalanceCents);
            for (const point of history) {
              const throughPoint = rows
                .filter((row) => row.occurredAt <= point.at)
                .reduce((sum, row) => sum + ledgerEffect(row), 0);
              expect(account.openingBalanceCents + throughPoint).toBe(point.balanceCents);
            }
            expect(history.length).toBeGreaterThan(1);
          }
        }
      } finally {
        harness.closeAll();
      }
    }
  });
});
