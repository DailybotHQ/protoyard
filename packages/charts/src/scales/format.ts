import { stepPrecision } from './ticks.ts';
import type { TimeInterval } from './time.ts';

/*
 * Formatters for axes and tooltips. Defaults are fixed (en-US, UTC) so a
 * prototype renders the same text on every machine; pass `locale` to change.
 * Intl formatters are cached because axes format many ticks per render.
 */

const DEFAULT_LOCALE = 'en-US';
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(options)}`;
  let format = cache.get(key) as Intl.NumberFormat | undefined;
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    cache.set(key, format);
  }
  return format;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(options)}`;
  let format = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
    cache.set(key, format);
  }
  return format;
}

export interface NumberFormatOptions {
  locale?: string;
  /** Show `+` on positive values (deltas). */
  signed?: boolean;
}

export interface FormatNumberOptions extends NumberFormatOptions {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

export function formatNumber(value: number, options: FormatNumberOptions = {}): string {
  return numberFormat(options.locale ?? DEFAULT_LOCALE, {
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    signDisplay: options.signed ? 'exceptZero' : 'auto',
  }).format(value);
}

/** Short form for axes and tiles: 1234 → "1.2K", 3_400_000 → "3.4M". */
export function formatCompact(value: number, options: NumberFormatOptions = {}): string {
  return numberFormat(options.locale ?? DEFAULT_LOCALE, {
    notation: 'compact',
    maximumFractionDigits: 1,
    signDisplay: options.signed ? 'exceptZero' : 'auto',
  }).format(value);
}

/** A tick label with exactly the decimals that ticks spaced `step` apart need. */
export function formatTick(value: number, step: number, options: NumberFormatOptions = {}): string {
  const digits = stepPrecision(step);
  return formatNumber(value, {
    ...options,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export interface FormatCentsOptions extends NumberFormatOptions {
  /** `$1.2K` instead of `$1,234.56`. */
  compact?: boolean;
  /** Drop the cents when they are zero: `$12` instead of `$12.00`. */
  trimZeroCents?: boolean;
}

/**
 * Money stored as integer cents (Protoyard rule: money is integer cents).
 * A non-integer input is a bug upstream, so it throws instead of rounding.
 */
export function formatCents(
  cents: number,
  currency = 'USD',
  options: FormatCentsOptions = {}
): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`formatCents(): expected integer cents, got ${cents}`);
  }
  const locale = options.locale ?? DEFAULT_LOCALE;
  const signDisplay = options.signed ? 'exceptZero' : 'auto';
  if (options.compact) {
    return numberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
      signDisplay,
    }).format(cents / 100);
  }
  const whole = options.trimZeroCents && cents % 100 === 0;
  return numberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay,
    ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(cents / 100);
}

export interface FormatPercentOptions extends NumberFormatOptions {
  /** Decimal places (default 1). */
  digits?: number;
}

/** A ratio as a percentage: 0.125 → "12.5%". */
export function formatPercent(ratio: number, options: FormatPercentOptions = {}): string {
  return numberFormat(options.locale ?? DEFAULT_LOCALE, {
    style: 'percent',
    maximumFractionDigits: options.digits ?? 1,
    signDisplay: options.signed ? 'exceptZero' : 'auto',
  }).format(ratio);
}

export interface FormatDateOptions {
  locale?: string;
}

/** A UTC tick label at the granularity of `interval` (see `timeScale().tickInterval()`). */
export function formatTimeTick(
  ms: number,
  interval: TimeInterval,
  options: FormatDateOptions = {}
): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const date = new Date(ms);
  switch (interval.unit) {
    case 'year':
      return dateFormat(locale, { year: 'numeric' }).format(date);
    case 'month':
      if (interval.step === 3) {
        return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
      }
      return dateFormat(locale, { month: 'short', year: 'numeric' }).format(date);
    case 'week':
    case 'day':
      return dateFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    case 'hour':
    case 'minute':
      return dateFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
        date
      );
    case 'second':
      return dateFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(date);
  }
}

/** A full UTC date for tooltips: "Mar 2, 2026" (or with time when `withTime`). */
export function formatDate(
  ms: number,
  options: FormatDateOptions & { withTime?: boolean } = {}
): string {
  return dateFormat(options.locale ?? DEFAULT_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(options.withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(new Date(ms));
}
