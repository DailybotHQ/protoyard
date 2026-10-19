import { MS_PER_DAY } from '@protoyard/core';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/** "Oct 14" for a `YYYY-MM-DD` day (rendered in UTC so it never shifts a day). */
export const formatDay = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));
export const formatLongDay = (day: string) => longDate.format(new Date(`${day}T00:00:00Z`));

/** "3 days ago" / "in 2 hours" relative to the SIMULATED now (never Date.now()). */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (Number.isNaN(diff)) return '';
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * MS_PER_DAY) return relative.format(Math.round(diff / MS_PER_DAY), 'day');
  return relative.format(Math.round(diff / (30 * MS_PER_DAY)), 'month');
}

/** "due in 3 days" / "2 days overdue" for a `YYYY-MM-DD` due day. */
export function dueLabel(day: string, now: Date): string {
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - today) / MS_PER_DAY);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return '1 day overdue';
  if (days < 0) return `${-days} days overdue`;
  if (days < 7) return `Due in ${days} days`;
  return `Due ${formatDay(day)}`;
}
