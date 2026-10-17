import { MS_PER_DAY } from '@protoyard/core';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

export const money = (amount: number) => currency.format(amount);
export const moneyCompact = (amount: number) => compact.format(amount);
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** "3 days ago" / "in 2 weeks" relative to the SIMULATED now. */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * MS_PER_DAY) return relative.format(Math.round(diff / MS_PER_DAY), 'day');
  if (abs < 365 * MS_PER_DAY) return relative.format(Math.round(diff / (30 * MS_PER_DAY)), 'month');
  return relative.format(Math.round(diff / (365 * MS_PER_DAY)), 'year');
}

/** yyyy-mm-dd for <input type="date"> from an ISO instant. */
export const toDateInput = (iso: string) => iso.slice(0, 10);
