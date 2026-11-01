import { createWorkbook, displayValue, validateSheet } from '@protoyard/views-ui/sheet';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { FintechDatabase, Transaction } from '../src/database/schema.ts';
import { LEDGER_SHEET_ROWS, ledgerSheet, signedCents } from '../src/domain/ledger-sheet.ts';
import { readAccounts, readTransactions } from '../src/domain/queries.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<FintechDatabase>(definition);
afterEach(() => harness.closeAll());

const accounts = [{ id: 'account-checking', name: 'Everyday Checking' }];
function tx(id: string, patch: Partial<Transaction> = {}): Transaction {
  return {
    id,
    accountId: 'account-checking',
    relatedAccountId: null,
    type: 'expense',
    direction: null,
    category: 'Groceries',
    description: `Purchase ${id}`,
    amountCents: 1_999,
    occurredAt: '2026-10-01T12:00:00.000Z',
    ...patch,
  };
}

/** The net row's computed value. */
function net(sheet: ReturnType<typeof ledgerSheet>) {
  const tab = sheet.sheets[0];
  return createWorkbook(sheet).value('ledger', tab.rows - 1, 4);
}

describe('fintech ledger sheet', () => {
  it('is a valid sheet whose net row sums the signed amounts to the cent', async () => {
    harness = createHarness<FintechDatabase>(definition);
    const runtime = await harness.boot('active');
    const transactions = await readTransactions(runtime.db);
    expect(transactions.length).toBeGreaterThan(0);
    const sheet = ledgerSheet(transactions, await readAccounts(runtime.db));

    const checked = validateSheet(sheet);
    expect(checked.ok, JSON.stringify(checked.issues[0])).toBe(true);
    const cents = transactions
      .slice(0, LEDGER_SHEET_ROWS)
      .reduce((sum, row) => sum + signedCents(row), 0);
    expect(Math.round(Number(net(sheet)) * 100)).toBe(cents);
    // Newest first, like the query.
    expect(sheet.sheets[0].cells.A2).toBe(transactions[0]?.occurredAt.slice(0, 10));
  });

  it('signs income and incoming transfers positive, everything else negative', () => {
    expect(signedCents(tx('a', { type: 'income' }))).toBe(1_999);
    expect(signedCents(tx('b', { type: 'transfer', direction: 'in' }))).toBe(1_999);
    expect(signedCents(tx('c', { type: 'transfer', direction: 'out' }))).toBe(-1_999);
    expect(signedCents(tx('d'))).toBe(-1_999);
  });

  it('shows record text as typed: a formula-like description never evaluates', () => {
    const sheet = ledgerSheet(
      [tx('a', { description: '=SUM(1,2)', category: "'quoted" })],
      accounts
    );
    expect(validateSheet(sheet).ok).toBe(true);
    const book = createWorkbook(sheet);
    expect(displayValue(book.value('ledger', 1, 1))).toBe('=SUM(1,2)');
    expect(displayValue(book.value('ledger', 1, 3))).toBe("'quoted");
  });

  it('keeps the newest rows under the sheet limit, and an empty ledger nets to zero', () => {
    const many = Array.from({ length: LEDGER_SHEET_ROWS + 5 }, (_, i) => tx(`t${i}`));
    const sheet = ledgerSheet(many, accounts);
    expect(sheet.sheets[0].rows).toBe(LEDGER_SHEET_ROWS + 2);
    expect(sheet.sheets[0].cells[`B${LEDGER_SHEET_ROWS + 1}`]).toBe(
      `Purchase t${LEDGER_SHEET_ROWS - 1}`
    );
    expect(validateSheet(sheet).ok).toBe(true);

    const empty = ledgerSheet([], accounts);
    expect(validateSheet(empty).ok).toBe(true);
    expect(net(empty)).toBe(0);
  });
});
