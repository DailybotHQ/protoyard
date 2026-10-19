/*
 * KPI number formatting, kept tiny so tiles can sit on a first screen.
 * `cents` values are integer cents (money); `percent` values are ratios.
 */

export type KpiUnit = 'number' | 'compact' | 'cents' | 'percent';

const cache = new Map<string, Intl.NumberFormat>();
const nf = (options: Intl.NumberFormatOptions) => {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', options);
    cache.set(key, f);
  }
  return f;
};

export function formatKpi(
  value: number | null | undefined,
  unit: KpiUnit = 'number',
  currency = 'USD',
  signed = false
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const signDisplay = signed ? 'exceptZero' : 'auto';
  switch (unit) {
    case 'cents':
      return nf({
        style: 'currency',
        currency,
        notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
        maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 1 : 2,
        signDisplay,
      }).format(value / 100);
    case 'percent':
      return nf({ style: 'percent', maximumFractionDigits: 1, signDisplay }).format(value);
    case 'compact':
      return nf({ notation: 'compact', maximumFractionDigits: 1, signDisplay }).format(value);
    default:
      return nf({ maximumFractionDigits: 2, signDisplay }).format(value);
  }
}

export interface KpiDelta {
  /** value − previous */
  absolute: number;
  /** Relative change; null when the previous value is 0. */
  relative: number | null;
  /** "+12.4%", or the signed absolute change when there is no percentage. */
  text: string;
}

/** The change from `previous` to `value`, or null when either is missing. */
export function kpiDelta(
  value: number | null | undefined,
  previous: number | null | undefined,
  unit: KpiUnit = 'number',
  currency = 'USD'
): KpiDelta | null {
  if (value === null || value === undefined || previous === null || previous === undefined)
    return null;
  if (!Number.isFinite(value) || !Number.isFinite(previous)) return null;
  const absolute = value - previous;
  const relative = previous === 0 ? null : absolute / Math.abs(previous);
  return {
    absolute,
    relative,
    text:
      relative === null
        ? formatKpi(absolute, unit, currency, true)
        : formatKpi(relative, 'percent', currency, true),
  };
}
