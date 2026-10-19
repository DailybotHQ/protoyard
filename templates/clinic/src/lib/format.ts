import { MS_PER_DAY } from '@protoyard/core';

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});
const stamp = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** "Wed, Oct 14" (UTC, the zone every appointment is stored in). */
export const formatDay = (iso: string) => dateFormat.format(new Date(iso));
export const formatLongDay = (iso: string) => longDate.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const formatStamp = (iso: string) => `${stamp.format(new Date(iso))} UTC`;
/** "Wed, Oct 14 · 10:00 AM–10:30 AM UTC". */
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

/** `YYYY-MM-DD` of an instant (UTC). */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
