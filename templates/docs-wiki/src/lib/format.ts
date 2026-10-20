import { MS_PER_DAY } from '@protoyard/core';

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const stamp = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** "Oct 14, 2026, 1:00 PM UTC". */
export const formatStamp = (iso: string) => `${stamp.format(new Date(iso))} UTC`;

/** "3 days ago" relative to the SIMULATED now (never Date.now()). */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (Number.isNaN(diff)) return '';
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  return relative.format(Math.round(diff / MS_PER_DAY), 'day');
}

/** Persona names by id, from the runtime's persona table. */
export type Names = ReadonlyMap<string, string>;
