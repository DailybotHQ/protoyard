import { MS_PER_DAY } from '@protoyard/core';
import type { ItemStatus } from '../database/schema.ts';

export const STATUS_LABELS: Record<ItemStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
};

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/** "2 hours ago" relative to the SIMULATED now (never the machine clock). */
export function fromNow(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return relative.format(Math.round(diff / 60_000), 'minute');
  if (abs < MS_PER_DAY) return relative.format(Math.round(diff / 3_600_000), 'hour');
  return relative.format(Math.round(diff / MS_PER_DAY), 'day');
}
