import { MS_PER_DAY } from '@protoyard/core';

const formatters = new Map<string, Intl.NumberFormat>();
/** `digits` = fraction digits for the full format (0 for whole amounts, 2 otherwise). */
function currencyFormat(currency: string, compact: boolean, digits = 0): Intl.NumberFormat {
  const key = `${currency}:${compact}:${digits}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: compact ? 0 : digits,
      maximumFractionDigits: compact ? 1 : digits,
      ...(compact ? { notation: 'compact' as const } : {}),
    });
    formatters.set(key, format);
  }
  return format;
}

/**
 * Money is stored as integer cents and divided only here, at display time.
 * Currency comes from workspace settings, so changing it in Settings updates every screen.
 */
export const money = (cents: number, currency = 'USD') =>
  // Whole amounts stay clean ($1,200); amounts with cents show them ($0.30, $1,299.50).
  currencyFormat(currency, false, Math.round(cents) % 100 === 0 ? 0 : 2).format(cents / 100);
export const moneyCompact = (cents: number, currency = 'USD') =>
  currencyFormat(currency, true).format(cents / 100);

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
