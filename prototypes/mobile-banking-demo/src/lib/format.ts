import { MS_PER_DAY } from '@protoyard/core';
import type { AccountType, Category } from '../database/schema.ts';

export { formatMoney } from '../database/schema.ts';

const signedMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'exceptZero',
});
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const fullDate = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const monthLabel = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `+$12.50` / `−$8.00`, for ledger rows. */
export const formatSigned = (cents: number) => signedMoney.format(cents / 100);
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
export const formatDateTime = (iso: string) => `${fullDate.format(new Date(iso))} UTC`;
export const formatMonth = (monthKey: string) =>
  monthLabel.format(new Date(`${monthKey}-01T00:00:00Z`));

/** "Today" / "Yesterday" / "Oct 3", relative to the SIMULATED now. */
export function formatDay(iso: string, now: Date): string {
  const day = Math.floor(Date.parse(iso) / MS_PER_DAY);
  const today = Math.floor(now.getTime() / MS_PER_DAY);
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  return formatShortDate(iso);
}

/** Greeting by the simulated hour (UTC, like every date in this demo). */
export function greeting(now: Date): string {
  const hour = now.getUTCHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const CATEGORY_LABELS: Record<Category, string> = {
  groceries: 'Groceries',
  dining: 'Dining',
  transport: 'Transport',
  shopping: 'Shopping',
  utilities: 'Utilities',
  rent: 'Rent',
  salary: 'Salary',
  transfer: 'Transfers',
  entertainment: 'Entertainment',
  health: 'Health',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit card',
};

/** Below this, checking shows a "low balance" warning. */
export const LOW_BALANCE_CENTS = 5_000;

/**
 * Parses what people type into an amount field ("1,250.5", "$20") into
 * dollars. Returns null for anything that is not a plain positive amount
 * with at most two decimals.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}
