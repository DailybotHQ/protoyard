import { MS_PER_DAY } from '@protoyard/core';

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longDay = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/** "3 days ago" relative to the SIMULATED now. */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * MS_PER_DAY) return relative.format(Math.round(diff / MS_PER_DAY), 'day');
  return relative.format(Math.round(diff / (30 * MS_PER_DAY)), 'month');
}

/** Compact sidebar stamp: time today, weekday this week, date otherwise. */
export function shortStamp(iso: string, now: Date): string {
  const at = new Date(iso);
  if (at.toDateString() === now.toDateString()) return time.format(at);
  if (Math.abs(now.getTime() - at.getTime()) < 6 * MS_PER_DAY) return weekday.format(at);
  return day.format(at);
}

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatLongDay = (iso: string) => longDay.format(new Date(iso));
