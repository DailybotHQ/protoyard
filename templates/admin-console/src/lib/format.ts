import { MS_PER_DAY } from '@protoyard/core';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
/** Money is stored as integer cents and divided only here, at display time. */
export const usd = (cents: number) => money.format(Math.round(cents) / 100);

const date = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});
export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatDateTime = (iso: string) => `${dateTime.format(new Date(iso))} UTC`;

/** "3 days ago" relative to the simulated clock (never the wall clock). */
export function fromNow(iso: string, now: Date): string {
  const days = Math.round((now.getTime() - Date.parse(iso)) / MS_PER_DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return formatDate(iso);
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
