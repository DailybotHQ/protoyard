import { z } from 'zod';

/*
 * Date ranges for analytics screens, resolved against a caller-supplied "now"
 * (the prototype's simulated clock), never Date.now(). Everything is UTC.
 * A range is half-open: [start, end) in epoch milliseconds.
 */

export const DAY_MS = 86_400_000;

export interface DateRange {
  /** Inclusive start, epoch ms (UTC). */
  start: number;
  /** Exclusive end, epoch ms (UTC). */
  end: number;
}

export const DATE_RANGE_PRESETS = [
  'today',
  'yesterday',
  'last-7-days',
  'last-30-days',
  'last-90-days',
  'month-to-date',
  'quarter-to-date',
  'year-to-date',
  'last-month',
] as const;

export const DateRangePresetSchema = z.enum(DATE_RANGE_PRESETS);
export type DateRangePreset = z.infer<typeof DateRangePresetSchema>;

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'last-7-days': 'Last 7 days',
  'last-30-days': 'Last 30 days',
  'last-90-days': 'Last 90 days',
  'month-to-date': 'Month to date',
  'quarter-to-date': 'Quarter to date',
  'year-to-date': 'Year to date',
  'last-month': 'Last month',
};

const isoDay = z.iso.date();
const isoInstant = z.iso.datetime({ offset: true });

/**
 * A saved or URL-encoded range: a preset, or a custom span. Custom `YYYY-MM-DD`
 * days are inclusive (`2026-03-01`…`2026-03-07` is seven days); custom
 * instants are half-open like every resolved range.
 */
export const DateRangeInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('preset'), preset: DateRangePresetSchema }),
  z
    .strictObject({
      kind: z.literal('custom'),
      start: z.union([isoDay, isoInstant]),
      end: z.union([isoDay, isoInstant]),
    })
    .refine(
      (range) =>
        customBounds(range.start, range.end).end > customBounds(range.start, range.end).start,
      {
        message: 'The end must be after the start',
        path: ['end'],
      }
    ),
]);
export type DateRangeInput = z.infer<typeof DateRangeInputSchema>;

export const ComparisonSchema = z.enum(['none', 'previous-period', 'previous-year']);
export type Comparison = z.infer<typeof ComparisonSchema>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function customBounds(start: string, end: string): DateRange {
  const s = Date.parse(DATE_ONLY.test(start) ? `${start}T00:00:00.000Z` : start);
  const e = DATE_ONLY.test(end) ? Date.parse(`${end}T00:00:00.000Z`) + DAY_MS : Date.parse(end);
  return { start: s, end: e };
}

const toMs = (now: Date | number) => (typeof now === 'number' ? now : now.getTime());

/** UTC midnight of the day containing `ms`. */
export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * Resolves a preset or custom range at `now`. "Last N days" includes today
 * (today and the N − 1 days before it) and, like the "to date" presets, ends
 * at `now`; yesterday and last month end at their calendar boundary.
 */
export function resolveDateRange(input: DateRangeInput, now: Date | number): DateRange {
  const t = toMs(now);
  if (input.kind === 'custom') return customBounds(input.start, input.end);
  const today = startOfDay(t);
  const d = new Date(t);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  switch (input.preset) {
    case 'today':
      return { start: today, end: t };
    case 'yesterday':
      return { start: today - DAY_MS, end: today };
    case 'last-7-days':
      return { start: today - 6 * DAY_MS, end: t };
    case 'last-30-days':
      return { start: today - 29 * DAY_MS, end: t };
    case 'last-90-days':
      return { start: today - 89 * DAY_MS, end: t };
    case 'month-to-date':
      return { start: Date.UTC(year, month, 1), end: t };
    case 'quarter-to-date':
      return { start: Date.UTC(year, Math.floor(month / 3) * 3, 1), end: t };
    case 'year-to-date':
      return { start: Date.UTC(year, 0, 1), end: t };
    case 'last-month':
      return { start: Date.UTC(year, month - 1, 1), end: Date.UTC(year, month, 1) };
  }
}

/** Shifts `ms` by whole calendar years, clamping Feb 29 to Feb 28 in non-leap years. */
function shiftYears(ms: number, years: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return Date.UTC(y, m, day) + (ms - Date.UTC(d.getUTCFullYear(), m, d.getUTCDate()));
}

/**
 * The range to compare against: the same length immediately before
 * (`previous-period`), or the same calendar span one year earlier
 * (`previous-year`). `null` for `none`.
 */
export function comparisonRange(range: DateRange, comparison: Comparison): DateRange | null {
  if (comparison === 'none') return null;
  if (comparison === 'previous-period') {
    const length = range.end - range.start;
    return { start: range.start - length, end: range.start };
  }
  return { start: shiftYears(range.start, -1), end: shiftYears(range.end, -1) };
}

/** Whether `ms` lies in `[start, end)`. */
export function inRange(ms: number, range: DateRange): boolean {
  return ms >= range.start && ms < range.end;
}
