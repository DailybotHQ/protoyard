import { MS_PER_DAY } from '@protoyard/core';

const formatters = new Map<string, Intl.NumberFormat>();
function currencyFormat(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: compact ? 1 : 0,
      ...(compact ? { notation: 'compact' as const } : {}),
    });
    formatters.set(key, format);
  }
  return format;
}

/** Currency comes from workspace settings, so changing it in Settings updates every screen. */
export const money = (amount: number, currency = 'USD') =>
  currencyFormat(currency, false).format(amount);
export const moneyCompact = (amount: number, currency = 'USD') =>
  currencyFormat(currency, true).format(amount);

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDay = (isoDay: string) => dayFormat.format(new Date(`${isoDay}T00:00:00Z`));

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/** "3 days ago" relative to the SIMULATED now (never Date.now()). */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (Number.isNaN(diff)) return '';
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * MS_PER_DAY) return relative.format(Math.round(diff / MS_PER_DAY), 'day');
  return formatDate(iso);
}

export const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
