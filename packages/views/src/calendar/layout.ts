import { dayBounds, type IsoDate, parseInstant, wallTime } from './dates.ts';

export interface TimedEvent {
  id: string;
  /** ISO instants. */
  start: string;
  end: string;
  /** All-day events belong in the all-day row, so `layoutDay` skips them. */
  allDay?: boolean;
}

export interface DayLayoutItem<T extends TimedEvent> {
  event: T;
  /** 0-based column inside its group of overlapping events. */
  column: number;
  /** Columns in that group: the event's width is 1 / columnCount. */
  columnCount: number;
  /**
   * Wall-clock minutes since midnight in the view's zone (0–1440), so events
   * line up with the hour labels even on 23- and 25-hour DST days.
   */
  startMinute: number;
  endMinute: number;
  /** Clipped at the day's start / end (it began before or ends after this day). */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface DayLayoutOptions {
  date: IsoDate;
  timeZone: string;
  /** Shortest drawn height, so instant and DST-folded events stay clickable (default 15). */
  minMinutes?: number;
}

function minuteOfDay(instant: number, timeZone: string): number {
  const wall = wallTime(instant, timeZone);
  return wall.hour * 60 + wall.minute + wall.second / 60;
}

/**
 * Places the timed events of one day into side-by-side columns. Events that
 * overlap (transitively) share a group; each takes the first free column, in
 * order of start, then longest first, then id, so the layout is stable.
 */
export function layoutDay<T extends TimedEvent>(
  events: readonly T[],
  options: DayLayoutOptions
): DayLayoutItem<T>[] {
  const day = dayBounds(options.date, options.timeZone);
  const minMinutes = options.minMinutes ?? 15;
  const items: DayLayoutItem<T>[] = [];
  for (const event of events) {
    if (event.allDay) continue;
    const start = parseInstant(event.start);
    const end = parseInstant(event.end);
    if (end <= day.start || start >= day.end || end < start) continue;
    const continuesBefore = start < day.start;
    const continuesAfter = end > day.end;
    const startMinute = continuesBefore ? 0 : minuteOfDay(start, options.timeZone);
    const rawEnd = end >= day.end ? 1440 : minuteOfDay(end, options.timeZone);
    const endMinute = Math.min(1440, Math.max(rawEnd, startMinute + minMinutes));
    items.push({
      event,
      column: 0,
      columnCount: 1,
      startMinute,
      endMinute,
      continuesBefore,
      continuesAfter,
    });
  }
  items.sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      b.endMinute - b.startMinute - (a.endMinute - a.startMinute) ||
      (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0)
  );

  // Overlap is judged on what is drawn (wall minutes), so nothing paints over anything.
  let group: DayLayoutItem<T>[] = [];
  let columnEnds: number[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;
  const close = () => {
    for (const item of group) item.columnCount = columnEnds.length;
    group = [];
    columnEnds = [];
  };
  for (const item of items) {
    if (item.startMinute >= groupEnd) close();
    let column = columnEnds.findIndex((end) => end <= item.startMinute);
    if (column < 0) column = columnEnds.push(0) - 1;
    columnEnds[column] = item.endMinute;
    item.column = column;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMinute);
  }
  close();
  return items;
}
