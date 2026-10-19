/**
 * Civil dates and wall-clock time in an explicit IANA time zone, with no date
 * library: `Date.UTC` arithmetic for calendar dates and `Intl.DateTimeFormat`
 * for zone offsets. Nothing here reads the system clock or the system zone.
 */

/** A calendar date with no time or zone, as `YYYY-MM-DD`. */
export type IsoDate = string;

/** Wall-clock time in some zone. `weekday`: 0 = Sunday … 6 = Saturday. */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DAY_MS = 86_400_000;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`invalid date "${date}" (expected YYYY-MM-DD)`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (formatIsoDate(year, month, day) !== date) throw new RangeError(`invalid date "${date}"`);
  return { year, month, day };
}

/** Normalizes overflow (month 13, day 0…) the way `Date.UTC` does. */
export function formatIsoDate(year: number, month: number, day: number): IsoDate {
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function dateMs(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  return formatIsoDate(year, month, day + days);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((dateMs(b) - dateMs(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: IsoDate): number {
  return new Date(dateMs(date)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock time of an instant (ms since epoch) in `timeZone`. */
export function wallTime(instant: number, timeZone: string): WallTime {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year as number,
    month: parts.month as number,
    day: parts.day as number,
    hour: (parts.hour as number) % 24,
    minute: parts.minute as number,
    second: parts.second as number,
  };
}

function wallMs(wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

/** UTC offset of `timeZone` at `instant`, in ms (east positive). */
function offsetAt(instant: number, timeZone: string): number {
  return wallMs(wallTime(instant, timeZone)) - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which `timeZone` shows `wall`. A time skipped by a DST jump
 * moves forward by the jump (02:30 on a spring-forward night is 03:30); a time
 * that happens twice takes the earlier one, as RFC 5545 does.
 */
export function zonedInstant(wall: WallTime, timeZone: string): number {
  const local = wallMs(wall);
  // Zones change offset at most once around any wall time, so the offsets a
  // day before and a day after give every candidate instant.
  const before = offsetAt(local - DAY_MS, timeZone);
  const after = offsetAt(local + DAY_MS, timeZone);
  const exact = [local - before, local - after]
    .filter((candidate) => wallMs(wallTime(candidate, timeZone)) === local)
    .sort((a, b) => a - b);
  // No candidate shows `wall` inside a gap: keep the offset from before the jump.
  return exact[0] ?? local - before;
}

export function toIso(instant: number): string {
  return new Date(instant).toISOString();
}

export function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) {
    throw new RangeError(`invalid instant "${iso}" (expected an ISO string with Z or an offset)`);
  }
  return ms;
}

/** The civil date of an instant in `timeZone`. */
export function dateIn(instant: number, timeZone: string): IsoDate {
  const wall = wallTime(instant, timeZone);
  return formatIsoDate(wall.year, wall.month, wall.day);
}

/** [start, end) of a civil day in `timeZone`: 23 or 25 hours on DST days. */
export function dayBounds(date: IsoDate, timeZone: string): { start: number; end: number } {
  const at = (d: IsoDate) => {
    const { year, month, day } = parseIsoDate(d);
    return zonedInstant({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
  };
  return { start: at(date), end: at(addDays(date, 1)) };
}
