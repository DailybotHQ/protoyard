import {
  addDays,
  type CalendarView,
  dateIn,
  dayBounds,
  type IsoDate,
  type Occurrence,
  parseInstant,
  parseIsoDate,
  toIso,
  wallTime,
  zonedInstant,
} from '@protoyard/views/calendar';

/** Keyboard and pointer edits snap to this many minutes. */
export const SLOT_MINUTES = 15;
export const MINUTES_PER_DAY = 1440;
/** Time-grid pixels per hour (the grid is 24 × this tall). */
export const HOUR_PX = 48;

export type CalendarMode = CalendarView;
export const MODE_KEYS: Record<string, CalendarMode> = {
  m: 'month',
  w: 'week',
  d: 'day',
  a: 'agenda',
};

/** `seriesId|occurrenceId`: one occurrence, stable while it moves. */
export const occurrenceKey = (o: Pick<Occurrence, 'seriesId' | 'occurrenceId'>) =>
  `${o.seriesId}|${o.occurrenceId}`;

export const snap = (minutes: number) => Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;

/** Wall-clock minutes since midnight of an instant in `timeZone`. */
export function minuteOfDay(instant: number, timeZone: string): number {
  const wall = wallTime(instant, timeZone);
  return wall.hour * 60 + wall.minute;
}

/** The instant of `minute` (since midnight, wall clock) on `date` in `timeZone`. */
export function slotInstant(date: IsoDate, minute: number, timeZone: string): number {
  const { year, month, day } = parseIsoDate(date);
  return zonedInstant(
    { year, month, day, hour: Math.floor(minute / 60), minute: minute % 60, second: 0 },
    timeZone
  );
}

export interface Move {
  /** Whole days; timed occurrences keep their wall-clock time across DST. */
  days: number;
  /** Minutes added to the start (and end, unless resizing). */
  minutes: number;
  /** Minutes added to the end only (edge-drag, Shift+arrows). */
  resize: number;
}

export const NO_MOVE: Move = { days: 0, minutes: 0, resize: 0 };
export const isNoMove = (m: Move) => m.days === 0 && m.minutes === 0 && m.resize === 0;

/** Where `occurrence` lands after `move`, in the series' format (instants, or dates for all-day). */
export function applyMove(
  occurrence: Pick<Occurrence, 'start' | 'end' | 'allDay'>,
  move: Move,
  timeZone: string
): { start: string; end: string } {
  if (occurrence.allDay) {
    return { start: addDays(occurrence.start, move.days), end: addDays(occurrence.end, move.days) };
  }
  const start = parseInstant(occurrence.start);
  const end = parseInstant(occurrence.end);
  const shiftDays = (instant: number) => {
    if (move.days === 0) return instant;
    const wall = wallTime(instant, timeZone);
    const date = addDays(dateIn(instant, timeZone), move.days);
    const { year, month, day } = parseIsoDate(date);
    return zonedInstant({ ...wall, year, month, day }, timeZone);
  };
  const newStart = shiftDays(start) + move.minutes * 60_000;
  const minEnd = newStart + SLOT_MINUTES * 60_000;
  const newEnd = Math.max(minEnd, shiftDays(end) + (move.minutes + move.resize) * 60_000);
  return { start: toIso(newStart), end: toIso(newEnd) };
}

/** The dates (in `timeZone`) an occurrence covers; all-day `end` is exclusive. */
export function occurrenceDates(
  o: Pick<Occurrence, 'start' | 'end' | 'allDay'>,
  timeZone: string
): { first: IsoDate; last: IsoDate } {
  if (o.allDay) return { first: o.start, last: addDays(o.end, -1) };
  const start = parseInstant(o.start);
  const end = parseInstant(o.end);
  const last = dateIn(Math.max(start, end - 1), timeZone);
  return { first: dateIn(start, timeZone), last };
}

/** Occurrences on `date`, all-day first, then by start. */
export function onDate<T extends Pick<Occurrence, 'start' | 'end' | 'allDay'>>(
  list: readonly T[],
  date: IsoDate,
  timeZone: string
): T[] {
  return list
    .filter((o) => {
      const { first, last } = occurrenceDates(o, timeZone);
      return first <= date && date <= last;
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

/** Intl formatters for one locale and zone (cached per pair). */
export function formats(locale: string, timeZone: string) {
  const f = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...options });
  const utc = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
  const at = (date: IsoDate) => Date.parse(`${date}T12:00:00Z`);
  const time = f({ hour: 'numeric', minute: '2-digit' });
  const weekday = utc({ weekday: 'short' });
  const longDate = utc({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const monthTitle = utc({ month: 'long', year: 'numeric' });
  const shortDate = utc({ month: 'short', day: 'numeric' });
  return {
    time: (instant: number) => time.format(instant),
    hour: (hour: number) => time.format(slotInstant('2026-01-05', hour * 60, timeZone)),
    weekday: (date: IsoDate) => weekday.format(at(date)),
    dayNumber: (date: IsoDate) => String(parseIsoDate(date).day),
    longDate: (date: IsoDate) => longDate.format(at(date)),
    monthTitle: (date: IsoDate) => monthTitle.format(at(date)),
    range: (from: IsoDate, to: IsoDate) =>
      `${shortDate.format(at(from))} – ${shortDate.format(at(to))}, ${parseIsoDate(to).year}`,
    /** "9:00 AM – 10:30 AM" or "All day". */
    span: (o: Pick<Occurrence, 'start' | 'end' | 'allDay'>) =>
      o.allDay
        ? 'All day'
        : `${time.format(parseInstant(o.start))} – ${time.format(parseInstant(o.end))}`,
  };
}
export type Formats = ReturnType<typeof formats>;

/** Wall minutes of `instant` on `date`, or null when it falls on another day. */
export function nowMinute(instant: number, date: IsoDate, timeZone: string): number | null {
  const { start, end } = dayBounds(date, timeZone);
  return instant >= start && instant < end ? minuteOfDay(instant, timeZone) : null;
}
