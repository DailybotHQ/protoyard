import {
  type Comparison,
  ComparisonSchema,
  comparisonRange,
  DAY_MS,
  type DateRange,
  type DateRangeInput,
  DateRangeInputSchema,
  type Granularity,
  GranularitySchema,
  PRESET_LABELS,
  resolveDateRange,
} from '@protoyard/analytics';

/*
 * The value a date range picker edits — a range (preset or custom days), a
 * comparison and a granularity — plus everything pure around it: validation,
 * the hash-query encoding, granularity limits, labels and month grids.
 */

export interface DateRangeValue {
  range: DateRangeInput;
  comparison: Comparison;
  granularity: Granularity;
}

/** What a panel edit changed: a new range closes the picker; the others are tweaks. */
export type DateRangeChange = 'range' | 'comparison' | 'granularity';

export const DEFAULT_DATE_RANGE: DateRangeValue = {
  range: { kind: 'preset', preset: 'last-30-days' },
  comparison: 'previous-period',
  granularity: 'day',
};

/** Granularities that make sense for a span: no hourly over a year, no monthly over a week. */
export function allowedGranularities(range: DateRange): Granularity[] {
  const span = Math.max(0, range.end - range.start);
  const out: Granularity[] = [];
  if (span <= 7 * DAY_MS) out.push('hour');
  if (span <= 400 * DAY_MS) out.push('day');
  if (span >= 14 * DAY_MS) out.push('week');
  if (span >= 60 * DAY_MS) out.push('month');
  return out.length ? out : ['day'];
}

/** A sensible default bucket size for a span. */
export function defaultGranularity(range: DateRange): Granularity {
  const span = range.end - range.start;
  if (span <= 2 * DAY_MS) return 'hour';
  if (span <= 92 * DAY_MS) return 'day';
  if (span <= 366 * DAY_MS) return 'week';
  return 'month';
}

/** Keeps `granularity` when the range allows it, otherwise picks the default for the range. */
export function fitGranularity(granularity: Granularity, range: DateRange): Granularity {
  return allowedGranularities(range).includes(granularity)
    ? granularity
    : defaultGranularity(range);
}

/**
 * Query encoding for the hash route: `range=last-30-days&compare=previous-period&by=day`,
 * custom days as `range=2026-03-01..2026-03-07`. Default values are left out.
 */
export function toDateRangeQuery(value: DateRangeValue): string {
  const params = new URLSearchParams();
  params.set(
    'range',
    value.range.kind === 'preset' ? value.range.preset : `${value.range.start}..${value.range.end}`
  );
  if (value.comparison !== 'none') params.set('compare', value.comparison);
  params.set('by', value.granularity);
  return params.toString();
}

/** Parses the query back; anything missing or invalid falls back to `fallback`'s part. */
export function fromDateRangeQuery(
  query: string | URLSearchParams,
  fallback: DateRangeValue = DEFAULT_DATE_RANGE
): DateRangeValue {
  const params =
    typeof query === 'string' ? new URLSearchParams(query.replace(/^[?#]/, '')) : query;
  const raw = params.get('range');
  let range = fallback.range;
  if (raw) {
    const [start, end] = raw.split('..');
    const candidate =
      end === undefined ? { kind: 'preset', preset: raw } : { kind: 'custom', start, end };
    const parsed = DateRangeInputSchema.safeParse(candidate);
    if (parsed.success) range = parsed.data;
  }
  // `compare` is left out of the query when it is `none`, so a query with a range but no
  // `compare` means "no comparison"; a query with neither keeps the fallback.
  const compare = ComparisonSchema.safeParse(params.get('compare'));
  const by = GranularitySchema.safeParse(params.get('by'));
  return {
    range,
    comparison: compare.success
      ? compare.data
      : raw && !params.has('compare')
        ? 'none'
        : fallback.comparison,
    granularity: by.success ? by.data : fallback.granularity,
  };
}

const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});
const yearFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Mar 1 – Mar 7, 2026" for a half-open range (the end day is the day before `end`). */
export function formatSpan(range: DateRange): string {
  const last = Math.max(range.start, range.end - 1);
  const sameYear = new Date(range.start).getUTCFullYear() === new Date(last).getUTCFullYear();
  if (Math.floor(range.start / DAY_MS) === Math.floor(last / DAY_MS))
    return yearFormat.format(range.start);
  return `${(sameYear ? dayFormat : yearFormat).format(range.start)} – ${yearFormat.format(last)}`;
}

/** The trigger label: "Last 30 days" or "Mar 1 – Mar 7, 2026". */
export function rangeLabel(input: DateRangeInput, now: number): string {
  return input.kind === 'preset'
    ? PRESET_LABELS[input.preset]
    : formatSpan(resolveDateRange(input, now));
}

export const COMPARISON_LABELS: Record<Comparison, string> = {
  none: 'No comparison',
  'previous-period': 'Previous period',
  'previous-year': 'Previous year',
};

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

/** Resolved range, comparison range and their text, ready for a subtitle or a query. */
export function describeDateRange(value: DateRangeValue, now: number) {
  const range = resolveDateRange(value.range, now);
  const compared = comparisonRange(range, value.comparison);
  return {
    range,
    compared,
    label: rangeLabel(value.range, now),
    span: formatSpan(range),
    comparedSpan: compared ? formatSpan(compared) : null,
  };
}

export interface MonthCell {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  ms: number;
  day: number;
  inMonth: boolean;
}

/** Weeks (rows of 7 days) covering a month, starting on `weekStartsOn` (default Monday). */
export function monthGrid(year: number, month: number, weekStartsOn = 1): MonthCell[][] {
  const first = Date.UTC(year, month, 1);
  const back = (new Date(first).getUTCDay() - weekStartsOn + 7) % 7;
  const start = first - back * DAY_MS;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((back + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const ms = start + (w * 7 + d) * DAY_MS;
      const date = new Date(ms);
      return {
        date: date.toISOString().slice(0, 10),
        ms,
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === ((month % 12) + 12) % 12,
      };
    })
  );
}

/** Weekday short names in grid order. */
export function weekdayNames(weekStartsOn = 1): string[] {
  const format = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
  // 2026-03-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    format.format(Date.UTC(2026, 2, 1 + ((weekStartsOn + i) % 7)))
  );
}

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
