import type { IsoWeekday } from './weekdays.ts';

/** A calendar date as `YYYY-MM-DD`, with no time and no zone. */
export type IsoDate = string;

export interface DateParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

export interface DateBounds {
  min?: IsoDate | null;
  max?: IsoDate | null;
}

export interface DateRange {
  start: IsoDate | null;
  end: IsoDate | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

// All arithmetic runs on UTC midnights, so the host time zone and DST never move a date.
function utc(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function partsOf(date: Date): DateParts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function daysInMonth(year: number, month: number): number {
  return utc(year, month + 1, 0).getUTCDate();
}

/** Strict `YYYY-MM-DD` parser; impossible dates such as `2026-02-30` are `null`. */
export function parseIsoDate(value: unknown): DateParts | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

export function isIsoDate(value: unknown): value is IsoDate {
  return parseIsoDate(value) !== null;
}

export function toIsoDate(parts: DateParts): IsoDate {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function requireDate(value: IsoDate): DateParts {
  const parts = parseIsoDate(value);
  if (!parts) throw new RangeError(`Invalid ISO date: ${value}`);
  return parts;
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const { year, month, day } = requireDate(value);
  return toIsoDate(partsOf(new Date(utc(year, month, day).getTime() + days * DAY_MS)));
}

/** Moves by whole months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(value: IsoDate, months: number): IsoDate {
  const { year, month, day } = requireDate(value);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return toIsoDate({
    year: nextYear,
    month: nextMonth,
    day: Math.min(day, daysInMonth(nextYear, nextMonth)),
  });
}

/** Negative, zero or positive, like a sort comparator. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isoWeekdayOf(value: IsoDate): IsoWeekday {
  const { year, month, day } = requireDate(value);
  return (((utc(year, month, day).getUTCDay() + 6) % 7) + 1) as IsoWeekday;
}

export function startOfWeek(value: IsoDate, weekStartsOn: IsoWeekday = 1): IsoDate {
  return addDays(value, -((isoWeekdayOf(value) - weekStartsOn + 7) % 7));
}

export function isWithinBounds(value: IsoDate, bounds: DateBounds = {}): boolean {
  if (bounds.min && compareIsoDates(value, bounds.min) < 0) return false;
  if (bounds.max && compareIsoDates(value, bounds.max) > 0) return false;
  return true;
}

export function clampIsoDate(value: IsoDate, bounds: DateBounds = {}): IsoDate {
  if (bounds.min && compareIsoDates(value, bounds.min) < 0) return bounds.min;
  if (bounds.max && compareIsoDates(value, bounds.max) > 0) return bounds.max;
  return value;
}

/** Inclusive length of a range in days (`2026-01-01`–`2026-01-01` is 1). */
export function rangeLengthInDays(start: IsoDate, end: IsoDate): number {
  const a = requireDate(start);
  const b = requireDate(end);
  return (
    Math.round(
      (utc(b.year, b.month, b.day).getTime() - utc(a.year, a.month, a.day).getTime()) / DAY_MS
    ) + 1
  );
}

/** Orders the two ends so `start <= end`. */
export function normalizeDateRange(range: DateRange): DateRange {
  if (range.start && range.end && compareIsoDates(range.start, range.end) > 0) {
    return { start: range.end, end: range.start };
  }
  return { start: range.start, end: range.end };
}

export function isInRange(value: IsoDate, range: DateRange): boolean {
  if (!range.start || !range.end) return false;
  return compareIsoDates(value, range.start) >= 0 && compareIsoDates(value, range.end) <= 0;
}

export type DateRangeIssue =
  | 'invalid-start'
  | 'invalid-end'
  | 'incomplete'
  | 'end-before-start'
  | 'out-of-bounds'
  | 'too-long';

export interface DateRangeRules extends DateBounds {
  /** Longest allowed range, inclusive, in days. */
  maxDays?: number;
  /** When true an empty or half-filled range is an issue. */
  required?: boolean;
}

/** The first problem with a range, or `null` when it is acceptable. */
export function validateDateRange(
  range: DateRange,
  rules: DateRangeRules = {}
): DateRangeIssue | null {
  if (range.start !== null && !isIsoDate(range.start)) return 'invalid-start';
  if (range.end !== null && !isIsoDate(range.end)) return 'invalid-end';
  if (!range.start || !range.end) {
    if (rules.required || (range.start === null) !== (range.end === null)) return 'incomplete';
    return null;
  }
  if (compareIsoDates(range.end, range.start) < 0) return 'end-before-start';
  if (!isWithinBounds(range.start, rules) || !isWithinBounds(range.end, rules)) {
    return 'out-of-bounds';
  }
  if (rules.maxDays !== undefined && rangeLengthInDays(range.start, range.end) > rules.maxDays) {
    return 'too-long';
  }
  return null;
}

export const DATE_RANGE_MESSAGES: Record<DateRangeIssue, string> = {
  'invalid-start': 'Enter the start date as YYYY-MM-DD.',
  'invalid-end': 'Enter the end date as YYYY-MM-DD.',
  incomplete: 'Choose both a start and an end date.',
  'end-before-start': 'The end date must be on or after the start date.',
  'out-of-bounds': 'Choose dates inside the allowed range.',
  'too-long': 'The range is longer than allowed.',
};

export interface CalendarDay {
  date: IsoDate;
  day: number;
  inMonth: boolean;
  weekday: IsoWeekday;
}

/** Six full weeks covering `month`, so the grid never changes height between months. */
export function monthGrid(
  year: number,
  month: number,
  weekStartsOn: IsoWeekday = 1
): CalendarDay[][] {
  let cursor = startOfWeek(toIsoDate({ year, month, day: 1 }), weekStartsOn);
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const parts = requireDate(cursor);
      week.push({
        date: cursor,
        day: parts.day,
        inMonth: parts.month === month && parts.year === year,
        weekday: isoWeekdayOf(cursor),
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Localized long label (`Wednesday, March 4, 2026`), read in UTC so it never shifts. */
export function formatIsoDate(
  value: IsoDate,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'full' }
): string {
  const parts = parseIsoDate(value);
  if (!parts) return '';
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    utc(parts.year, parts.month, parts.day)
  );
}

export function monthLabel(year: number, month: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utc(year, month, 1));
}

/**
 * The calendar date an instant falls on in `timeZone` (default UTC). Pass the
 * scenario clock (`runtime.clock.now()`) so "today" stays deterministic.
 */
export function isoDateFromInstant(instant: Date | number, timeZone = 'UTC'): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return toIsoDate({ year: read('year'), month: read('month'), day: read('day') });
}

export type DateInputIssue = 'format' | 'before-min' | 'after-max' | 'unavailable';

export interface DateInputRules extends DateBounds {
  isDateDisabled?: (date: IsoDate) => boolean;
}

export interface DateInputResult {
  /** The accepted date, or `null` for an empty field or a rejected entry. */
  value: IsoDate | null;
  issue: DateInputIssue | null;
}

/** Checks typed text: empty is `null` with no issue; anything else must be an allowed `YYYY-MM-DD`. */
export function checkDateText(text: string, rules: DateInputRules = {}): DateInputResult {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, issue: null };
  const parts = parseIsoDate(trimmed);
  if (!parts) return { value: null, issue: 'format' };
  const value = toIsoDate(parts);
  if (rules.min && compareIsoDates(value, rules.min) < 0)
    return { value: null, issue: 'before-min' };
  if (rules.max && compareIsoDates(value, rules.max) > 0)
    return { value: null, issue: 'after-max' };
  if (rules.isDateDisabled?.(value)) return { value: null, issue: 'unavailable' };
  return { value, issue: null };
}

export function dateInputMessage(issue: DateInputIssue, rules: DateBounds = {}): string {
  switch (issue) {
    case 'format':
      return 'Enter a real date as YYYY-MM-DD.';
    case 'before-min':
      return `Choose ${rules.min} or later.`;
    case 'after-max':
      return `Choose ${rules.max} or earlier.`;
    case 'unavailable':
      return 'That date is not available.';
  }
}
