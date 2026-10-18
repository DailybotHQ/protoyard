/**
 * Format integer cents as a currency string. Money is always whole cents in
 * Protoyard; never pass floats here.
 */
export function formatCents(cents: number, currency = 'USD', locale = 'en-US'): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('formatCents expects a safe integer number of cents.');
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Whole days remaining until an ISO instant, using the simulated clock. */
export function daysUntil(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return null;
  const ms = end - nowMs;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}
