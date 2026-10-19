import { addDays, daysBetween, type IsoDate } from '@protoyard/views/calendar';
import { durationDays, type ScheduleTask } from '@protoyard/views/timeline';

export const ZOOMS = ['day', 'week', 'month', 'quarter'] as const;
export type TimelineZoom = (typeof ZOOMS)[number];

/** CSS pixels per calendar day at each timeline zoom. */
export const DAY_WIDTH: Record<TimelineZoom, number> = {
  day: 48,
  week: 16,
  month: 5,
  quarter: 2,
};

export const ROW_HEIGHT = 44;
export const TASK_COLUMN_WIDTH = 250;
export const HEADER_HEIGHT = 48;

export function timelineRange(
  tasks: readonly ScheduleTask[],
  today?: IsoDate
): { start: IsoDate; end: IsoDate } {
  if (tasks.length === 0) {
    const anchor = today ?? '2026-01-15';
    return { start: addDays(anchor, -7), end: addDays(anchor, 14) };
  }
  const starts = tasks.map((task) => task.start).sort();
  const ends = tasks.map((task) => task.end).sort();
  const start = addDays(starts[0] as IsoDate, -7);
  const end = addDays(ends[ends.length - 1] as IsoDate, 14);
  return today
    ? {
        start: today < start ? addDays(today, -7) : start,
        end: today > end ? addDays(today, 14) : end,
      }
    : { start, end };
}

export function dateOffset(date: IsoDate, start: IsoDate): number {
  return daysBetween(start, date);
}

export function dateAtOffset(start: IsoDate, offset: number): IsoDate {
  return addDays(start, Math.round(offset));
}

export function durationLabel(task: ScheduleTask): string {
  if (task.milestone || task.start === task.end) return 'Milestone';
  const days = durationDays(task);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function progressValue(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
