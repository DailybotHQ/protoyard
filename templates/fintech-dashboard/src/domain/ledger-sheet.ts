import type { Account, Transaction } from '../database/schema.ts';

/** The most transactions the sheet shows (the newest first); Texuli caps a sheet at 100,000 cells. */
export const LEDGER_SHEET_ROWS = 1000;

/** A cell input in Texuli's sheet format: a number, text, or `=formula`. */
type CellInput = number | string;

/**
 * A Texuli workbook (`@texuli/sheets/model` `SheetDocument`) as plain data, so
 * this module never imports the lazy sheet package. The view validates it
 * (`validateSheet`, untrusted) before it paints.
 */
export interface LedgerSheet {
  format: 'texuli-sheet';
  formatVersion: 1;
  meta: { title: string };
  sheets: [
    { id: 'ledger'; name: string; rows: number; columns: number; cells: Record<string, CellInput> },
  ];
}

/** Signed effect on the user's money: income and incoming transfers add, the rest subtract. */
export function signedCents(row: Transaction): number {
  const adds = row.type === 'income' || (row.type === 'transfer' && row.direction === 'in');
  return adds ? row.amountCents : -row.amountCents;
}

/**
 * Record text is untrusted: text that would read as a formula (`=…`) or as the
 * literal-text marker (`'…`) gets Texuli's leading `'`, so it shows as typed
 * and never evaluates.
 */
function text(value: string): string {
  return value.startsWith('=') || value.startsWith("'") ? `'${value}` : value;
}

/**
 * The ledger as one read-only sheet: a header row, one row per transaction
 * (newest first, at most `LEDGER_SHEET_ROWS`), then a `Net` row that sums the
 * amounts with a formula. Amounts are signed currency units, exact to the cent.
 */
export function ledgerSheet(
  transactions: readonly Transaction[],
  accounts: readonly Pick<Account, 'id' | 'name'>[]
): LedgerSheet {
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const shown = transactions.slice(0, LEDGER_SHEET_ROWS);
  const cells: Record<string, CellInput> = {
    A1: 'Date',
    B1: 'Description',
    C1: 'Account',
    D1: 'Category',
    E1: 'Amount, USD',
  };
  shown.forEach((row, index) => {
    const at = index + 2;
    cells[`A${at}`] = row.occurredAt.slice(0, 10);
    cells[`B${at}`] = text(row.description);
    cells[`C${at}`] = text(names.get(row.accountId) ?? 'Account');
    cells[`D${at}`] = text(row.category);
    cells[`E${at}`] = signedCents(row) / 100;
  });
  const last = shown.length + 1;
  const net = last + 1;
  cells[`D${net}`] = 'Net';
  cells[`E${net}`] = shown.length > 0 ? `=SUM(E2:E${last})` : 0;
  return {
    format: 'texuli-sheet',
    formatVersion: 1,
    meta: { title: 'Transactions' },
    sheets: [{ id: 'ledger', name: 'Transactions', rows: net, columns: 5, cells }],
  };
}
