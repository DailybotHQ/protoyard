import { MS_PER_DAY } from '@protoyard/core';

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'short' });
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "3 h ago" relative to the SIMULATED now (never Date.now()). */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (Number.isNaN(diff)) return '';
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 7 * MS_PER_DAY) return relative.format(Math.round(diff / MS_PER_DAY), 'day');
  return dateFormat.format(new Date(iso));
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
