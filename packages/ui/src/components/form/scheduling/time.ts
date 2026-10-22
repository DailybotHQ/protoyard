/** A time of day as 24-hour `HH:mm` (for example `09:30` or `17:05`). */
export type TimeOfDay = string;

export type TimeFormat = 12 | 24;

export type DayPeriod = 'AM' | 'PM';

export interface TimeParts {
  /** 0–23 */
  hour: number;
  /** 0–59 */
  minute: number;
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Strict `HH:mm` parser; anything else (including `24:00` or `9:30`) is `null`. */
export function parseTimeOfDay(value: unknown): TimeParts | null {
  if (typeof value !== 'string') return null;
  const match = TIME_OF_DAY.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return parseTimeOfDay(value) !== null;
}

export function formatTimeOfDay(parts: TimeParts): TimeOfDay {
  if (
    !Number.isInteger(parts.hour) ||
    !Number.isInteger(parts.minute) ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59
  ) {
    throw new RangeError(`Invalid time of day: ${parts.hour}:${parts.minute}`);
  }
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/** Minutes since midnight, or `null` for an invalid value. */
export function minutesSinceMidnight(value: TimeOfDay): number | null {
  const parts = parseTimeOfDay(value);
  return parts ? parts.hour * 60 + parts.minute : null;
}

export function toTwelveHour(hour: number): { hour: number; period: DayPeriod } {
  return { hour: hour % 12 === 0 ? 12 : hour % 12, period: hour < 12 ? 'AM' : 'PM' };
}

export function fromTwelveHour(hour: number, period: DayPeriod): number {
  return (hour % 12) + (period === 'PM' ? 12 : 0);
}

/**
 * Minute steps for a picker. `interval` must be a whole number that divides 60
 * (1, 5, 10, 15, 30, 60…); anything else falls back to 15.
 */
export function minuteSteps(interval: number): number[] {
  const step = Number.isInteger(interval) && interval >= 1 && 60 % interval === 0 ? interval : 15;
  return Array.from({ length: 60 / step }, (_, i) => i * step);
}

/** Readable label: `9:30 AM` in the 12-hour format, `09:30` in the 24-hour one. */
export function timeOfDayLabel(value: TimeOfDay, format: TimeFormat = 12): string {
  const parts = parseTimeOfDay(value);
  if (!parts) return '';
  if (format === 24) return formatTimeOfDay(parts);
  const { hour, period } = toTwelveHour(parts.hour);
  return `${hour}:${String(parts.minute).padStart(2, '0')} ${period}`;
}
