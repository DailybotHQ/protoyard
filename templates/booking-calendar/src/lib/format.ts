import { MS_PER_DAY } from '@protoyard/core';

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** "Thu, Oct 15" (UTC, the zone every booking is stored in). */
export const formatDay = (iso: string) => dateFormat.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
/** "Thu, Oct 15 · 10:00 AM–12:00 PM UTC". */
export const formatSpan = (start: string, end: string) =>
  `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)} UTC`;

/** "3 days ago" relative to the SIMULATED now (never Date.now()). */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (Number.isNaN(diff)) return '';
  if (abs < 60_000) return 'now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  return relative.format(Math.round(diff / MS_PER_DAY), 'day');
}

/** `HH:MM` for minutes after midnight. */
export const formatMinute = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
