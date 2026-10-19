import { z } from 'zod';
import {
  addDays,
  dateIn,
  dayBounds,
  daysBetween,
  daysInMonth,
  formatIsoDate,
  type IsoDate,
  parseInstant,
  parseIsoDate,
  toIso,
  wallTime,
  weekdayOf,
  zonedInstant,
} from './dates.ts';

/**
 * A subset of RFC 5545 recurrence: FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL,
 * BYDAY (with ordinals such as `2TU` or `-1FR` for monthly and yearly rules),
 * BYMONTHDAY (negative counts from the month's end), COUNT, UNTIL, plus EXDATE
 * and per-occurrence overrides. Weeks start on Monday (RFC WKST default).
 * Occurrences repeat at the series' wall-clock time in its own time zone, so a
 * 09:00 meeting stays at 09:00 across daylight-saving changes.
 */

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export const RecurrenceRuleSchema = z.strictObject({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(1000).optional(),
  /** `MO`…`SU`; monthly and yearly rules also accept an ordinal: `1MO`, `-1FR`. */
  byDay: z
    .array(z.string().regex(/^([+-]?[1-5])?(SU|MO|TU|WE|TH|FR|SA)$/))
    .min(1)
    .optional(),
  byMonthDay: z
    .array(
      z
        .number()
        .int()
        .min(-31)
        .max(31)
        .refine((n) => n !== 0, 'day 0 does not exist')
    )
    .min(1)
    .optional(),
  count: z.number().int().min(1).max(10_000).optional(),
  /** Inclusive last start, as an ISO instant. */
  until: z.iso.datetime({ offset: true }).optional(),
});
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

export interface OccurrenceOverride<TData = unknown> {
  start?: string;
  end?: string;
  data?: TData;
}

/**
 * A calendar entry, recurring when it has a `rule`. Timed series use ISO
 * instants for `start`/`end`; all-day series use ISO dates (`end` exclusive).
 * Occurrence ids are the occurrence's original start in the same format.
 */
export interface CalendarSeries<TData = unknown> {
  id: string;
  start: string;
  end: string;
  allDay?: boolean;
  /** Zone the rule repeats in; defaults to the expansion's `timeZone`. */
  timeZone?: string;
  rule?: RecurrenceRule;
  /** Occurrence ids removed from the series. */
  exdates?: string[];
  /** Moved or edited occurrences, by occurrence id. */
  overrides?: Record<string, OccurrenceOverride<TData>>;
  data?: TData;
}

export interface Occurrence<TData = unknown> {
  seriesId: string;
  /** The original start; stable across moves, the key for overrides and EXDATE. */
  occurrenceId: string;
  start: string;
  end: string;
  allDay: boolean;
  recurring: boolean;
  overridden: boolean;
  data?: TData;
}

export interface ExpandOptions {
  /** Zone for series without their own `timeZone` and for all-day entries (default UTC). */
  timeZone?: string;
  /** At most this many occurrences (and never more than 1,000). */
  max?: number;
}

export interface Expansion<TData = unknown> {
  occurrences: Occurrence<TData>[];
  /** True when `max` cut the list short. */
  truncated: boolean;
}

export const MAX_OCCURRENCES = 1000;
/** A rule that matches nothing (BYMONTHDAY=31 with BYDAY=FE…) stops after this many periods. */
const MAX_PERIODS = 50_000;

interface ParsedDay {
  weekday: number;
  nth: number;
}

function parseDays(byDay: readonly string[] | undefined): ParsedDay[] {
  return (byDay ?? []).map((token) => {
    const code = token.slice(-2) as WeekdayCode;
    return { weekday: WEEKDAY_CODES.indexOf(code), nth: Number(token.slice(0, -2) || 0) };
  });
}

/** The dates a monthly or yearly rule produces in one month, ascending. */
function monthDates(
  year: number,
  month: number,
  rule: RecurrenceRule,
  anchorDay: number
): IsoDate[] {
  const length = daysInMonth(year, month);
  const days = parseDays(rule.byDay);
  let picked: number[];
  if (rule.byMonthDay) {
    picked = rule.byMonthDay
      .map((n) => (n > 0 ? n : length + 1 + n))
      .filter((n) => n >= 1 && n <= length);
    if (days.length > 0) {
      const allowed = new Set(days.map((d) => d.weekday));
      picked = picked.filter((n) => allowed.has(weekdayOf(formatIsoDate(year, month, n))));
    }
  } else if (days.length > 0) {
    const firstWeekday = weekdayOf(formatIsoDate(year, month, 1));
    picked = days.flatMap(({ weekday, nth }) => {
      const first = 1 + ((weekday - firstWeekday + 7) % 7);
      const all: number[] = [];
      for (let n = first; n <= length; n += 7) all.push(n);
      if (nth === 0) return all;
      const hit = nth > 0 ? all[nth - 1] : all[all.length + nth];
      return hit === undefined ? [] : [hit];
    });
  } else {
    picked = anchorDay <= length ? [anchorDay] : [];
  }
  return [...new Set(picked)].sort((a, b) => a - b).map((n) => formatIsoDate(year, month, n));
}

/** Candidate dates of `rule` from `firstDate`, ascending, starting at period `fromPeriod`. */
function* candidateDates(
  rule: RecurrenceRule,
  firstDate: IsoDate,
  fromPeriod: number
): Generator<IsoDate> {
  const interval = rule.interval ?? 1;
  const first = parseIsoDate(firstDate);
  const days = parseDays(rule.byDay);
  const weekdays = new Set(days.map((d) => d.weekday));
  const monthDaySet = rule.byMonthDay ? new Set(rule.byMonthDay) : null;
  const matchesMonthDay = (date: IsoDate) => {
    if (!monthDaySet) return true;
    const { year, month, day } = parseIsoDate(date);
    return monthDaySet.has(day) || monthDaySet.has(day - daysInMonth(year, month) - 1);
  };
  // Monday-based week of the first occurrence (RFC 5545 WKST=MO).
  const firstMonday = addDays(firstDate, -((weekdayOf(firstDate) + 6) % 7));

  for (let k = fromPeriod; k < fromPeriod + MAX_PERIODS; k++) {
    let dates: IsoDate[];
    if (rule.freq === 'daily') {
      const date = addDays(firstDate, k * interval);
      dates =
        (weekdays.size === 0 || weekdays.has(weekdayOf(date))) && matchesMonthDay(date)
          ? [date]
          : [];
    } else if (rule.freq === 'weekly') {
      const monday = addDays(firstMonday, k * interval * 7);
      const wanted = weekdays.size > 0 ? [...weekdays] : [weekdayOf(firstDate)];
      dates = wanted
        .map((weekday) => addDays(monday, (weekday + 6) % 7))
        .sort()
        .filter(matchesMonthDay);
    } else {
      const months = rule.freq === 'monthly' ? k * interval : k * interval * 12;
      const at = new Date(Date.UTC(first.year, first.month - 1 + months, 1));
      dates = monthDates(at.getUTCFullYear(), at.getUTCMonth() + 1, rule, first.day);
    }
    for (const date of dates) if (date >= firstDate) yield date;
  }
}

interface Original {
  id: string;
  start: number;
  end: number;
}

/** The first period index worth generating for a window starting at `fromDate`. */
function firstPeriod(
  rule: RecurrenceRule,
  firstDate: IsoDate,
  fromDate: IsoDate,
  spanDays: number
): number {
  // COUNT needs every earlier occurrence, so it always starts from the beginning.
  if (rule.count !== undefined) return 0;
  const interval = rule.interval ?? 1;
  const lead = daysBetween(firstDate, fromDate) - spanDays - 7;
  if (lead <= 0) return 0;
  if (rule.freq === 'daily') return Math.floor(lead / interval);
  if (rule.freq === 'weekly') return Math.floor(lead / (7 * interval));
  const months = Math.floor(lead / 31) - 1;
  return Math.max(0, Math.floor(months / (rule.freq === 'monthly' ? interval : 12 * interval)));
}

/** Walks the series' original occurrences that start before `toMs`, honoring COUNT, UNTIL and EXDATE. */
function* originals(
  series: CalendarSeries,
  zone: string,
  fromMs: number,
  toMs: number
): Generator<Original> {
  const allDay = series.allDay === true;
  const rule = series.rule;
  const startDate = allDay ? series.start : dateIn(parseInstant(series.start), zone);
  const spanMs = allDay
    ? daysBetween(series.start, series.end) * 86_400_000
    : parseInstant(series.end) - parseInstant(series.start);
  const instantOf = (date: IsoDate): number => {
    if (allDay) return dayBounds(date, zone).start;
    const time = wallTime(parseInstant(series.start), zone);
    return zonedInstant({ ...time, ...parseIsoDate(date) }, zone);
  };
  const endOf = (date: IsoDate, start: number): number =>
    allDay
      ? dayBounds(addDays(date, daysBetween(series.start, series.end)), zone).start
      : start + spanMs;
  const exdates = new Set(series.exdates ?? []);

  if (!rule) {
    const start = instantOf(startDate);
    yield { id: series.start, start, end: endOf(startDate, start) };
    return;
  }
  const until = rule.until ? parseInstant(rule.until) : Number.POSITIVE_INFINITY;
  const fromDate = dateIn(fromMs, zone);
  const period = firstPeriod(rule, startDate, fromDate, Math.ceil(spanMs / 86_400_000));
  let produced = 0;
  for (const date of candidateDates(rule, startDate, period)) {
    const start = instantOf(date);
    if (start > until || start >= toMs) return;
    if (rule.count !== undefined && produced >= rule.count) return;
    produced++;
    const id = allDay ? date : toIso(start);
    if (!exdates.has(id)) yield { id, start, end: endOf(date, start) };
  }
}

function zoneOf(series: CalendarSeries, options: ExpandOptions): string {
  return series.timeZone ?? options.timeZone ?? 'UTC';
}

function toOccurrence<TData>(
  series: CalendarSeries<TData>,
  original: Original,
  zone: string
): Occurrence<TData> {
  const override = series.overrides?.[original.id];
  const allDay = series.allDay === true;
  const format = (ms: number) => (allDay ? dateIn(ms, zone) : toIso(ms));
  const occurrence: Occurrence<TData> = {
    seriesId: series.id,
    occurrenceId: original.id,
    start: override?.start ?? format(original.start),
    end: override?.end ?? format(original.end),
    allDay,
    recurring: series.rule !== undefined,
    overridden: override !== undefined,
  };
  const data = override?.data ?? series.data;
  if (data !== undefined) occurrence.data = data;
  return occurrence;
}

function bounds(occurrence: Occurrence, zone: string): { start: number; end: number } {
  if (!occurrence.allDay)
    return { start: parseInstant(occurrence.start), end: parseInstant(occurrence.end) };
  return {
    start: dayBounds(occurrence.start, zone).start,
    end: dayBounds(occurrence.end, zone).start,
  };
}

/**
 * How many occurrences the rule generates before `occurrenceId` (EXDATEs
 * included, as COUNT counts them), or -1 when the rule never generates it.
 */
export function occurrenceIndex(
  series: CalendarSeries,
  occurrenceId: string,
  options: ExpandOptions = {}
): number {
  const zone = zoneOf(series, options);
  const at = series.allDay ? dayBounds(occurrenceId, zone).start : parseInstant(occurrenceId);
  let index = 0;
  const plain = { ...series, exdates: [] };
  // From the first period: an index needs every earlier occurrence.
  for (const original of originals(plain, zone, 0, at + 1)) {
    if (original.id === occurrenceId) return index;
    index++;
  }
  return -1;
}

/** Whether `occurrenceId` is one of the series' (non-excluded) occurrences. */
export function hasOccurrence(
  series: CalendarSeries,
  occurrenceId: string,
  options: ExpandOptions = {}
): boolean {
  const zone = zoneOf(series, options);
  const at = series.allDay ? dayBounds(occurrenceId, zone).start : parseInstant(occurrenceId);
  for (const original of originals(series, zone, at, at + 1))
    if (original.id === occurrenceId) return true;
  return false;
}

/**
 * The occurrences of `series` that overlap `window` ([start, end) ISO
 * instants), overrides applied (an override can move an occurrence into or
 * out of the window), ordered by start, then series id, then occurrence id.
 */
export function expandSeries<TData>(
  series: CalendarSeries<TData>,
  window: { start: string; end: string },
  options: ExpandOptions = {}
): Expansion<TData> {
  return expandAll([series], window, options);
}

/** `expandSeries` over many series, merged and ordered, with one `max` for all. */
export function expandAll<TData>(
  list: readonly CalendarSeries<TData>[],
  window: { start: string; end: string },
  options: ExpandOptions = {}
): Expansion<TData> {
  const max = Math.min(options.max ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const from = parseInstant(window.start);
  const to = parseInstant(window.end);
  const found: Occurrence<TData>[] = [];
  for (const series of list) {
    const zone = zoneOf(series, options);
    const seen = new Set<string>();
    const consider = (original: Original) => {
      seen.add(original.id);
      const occurrence = toOccurrence(series, original, zone);
      const span = bounds(occurrence, zone);
      if (span.start < to && span.end > from) found.push(occurrence);
    };
    // Originals that end after the window start; long spans reach back further.
    for (const original of originals(series, zone, from, to)) {
      if (original.end > from || series.overrides?.[original.id]) consider(original);
    }
    // Overrides that moved an occurrence from outside the window into it.
    for (const id of Object.keys(series.overrides ?? {})) {
      if (seen.has(id)) continue;
      // Walking to the original proves it is a real, non-excluded occurrence.
      let at: number;
      try {
        at = series.allDay ? dayBounds(id, zone).start : parseInstant(id);
      } catch {
        continue; // a malformed key in stored data never matches an occurrence
      }
      for (const original of originals(series, zone, at, at + 1))
        if (original.id === id) consider(original);
    }
  }
  found.sort(
    (a, b) =>
      compare(
        bounds(a, options.timeZone ?? 'UTC').start,
        bounds(b, options.timeZone ?? 'UTC').start
      ) ||
      compare(a.seriesId, b.seriesId) ||
      compare(a.occurrenceId, b.occurrenceId)
  );
  return { occurrences: found.slice(0, max), truncated: found.length > max };
}

function compare(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parses an RRULE string (`FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5`, with or without `RRULE:`). */
export function parseRRule(text: string): RecurrenceRule {
  const fields = new Map<string, string>();
  for (const part of text.replace(/^RRULE:/i, '').split(';')) {
    const [key, value] = part.split('=');
    if (key && value) fields.set(key.toUpperCase(), value.toUpperCase());
  }
  const until = fields.get('UNTIL');
  const untilMatch = until
    ? /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(until)
    : null;
  const list = (key: string) => fields.get(key)?.split(',');
  return RecurrenceRuleSchema.parse({
    freq: fields.get('FREQ')?.toLowerCase(),
    interval: fields.has('INTERVAL') ? Number(fields.get('INTERVAL')) : undefined,
    byDay: list('BYDAY'),
    byMonthDay: list('BYMONTHDAY')?.map(Number),
    count: fields.has('COUNT') ? Number(fields.get('COUNT')) : undefined,
    until: untilMatch
      ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}T${untilMatch[4] ?? '23'}:${untilMatch[5] ?? '59'}:${untilMatch[6] ?? '59'}Z`
      : undefined,
  });
}

/** The RRULE string of a rule (without the `RRULE:` prefix). */
export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval && rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay) parts.push(`BYDAY=${rule.byDay.join(',')}`);
  if (rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until)
    parts.push(`UNTIL=${toIso(parseInstant(rule.until)).replace(/[-:]|\.\d{3}/g, '')}`);
  return parts.join(';');
}
