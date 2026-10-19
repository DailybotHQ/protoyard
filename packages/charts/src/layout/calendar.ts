/*
 * Calendar heatmap and matrix grids. Calendar cells are UTC days: columns
 * are weeks, rows are weekdays starting at `weekStartsOn`. A day without a
 * value is `null`, so "no data" and "zero" can be drawn differently.
 */

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarCell {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  /** Column (week) index from 0. */
  week: number;
  /** Row 0…6 counted from `weekStartsOn`. */
  weekday: number;
  value: number | null;
  x: number;
  y: number;
  size: number;
}

export interface CalendarLayout {
  cells: CalendarCell[];
  /** Number of week columns. */
  weeks: number;
  /** First column of each month that starts in the range, for labels. */
  months: { month: string; week: number }[];
  width: number;
  height: number;
}

export interface CalendarLayoutOptions {
  /** Values by `YYYY-MM-DD`; days not listed are null. */
  values?: Readonly<Record<string, number>> | ReadonlyMap<string, number>;
  /** 0 = Sunday … 6 = Saturday (default 1, Monday). */
  weekStartsOn?: number;
  cellSize?: number;
  gap?: number;
}

const toDay = (d: string | number) => {
  const ms = typeof d === 'number' ? d : Date.parse(DATE_ONLY.test(d) ? `${d}T00:00:00.000Z` : d);
  if (!Number.isFinite(ms)) throw new RangeError(`calendarLayout(): invalid date "${d}"`);
  return Math.floor(ms / DAY_MS) * DAY_MS;
};

/** Every UTC day from `start` to `end` inclusive. */
export function calendarLayout(
  range: { start: string | number; end: string | number },
  options: CalendarLayoutOptions = {}
): CalendarLayout {
  const start = toDay(range.start);
  const end = toDay(range.end);
  const weekStartsOn = (((options.weekStartsOn ?? 1) % 7) + 7) % 7;
  const size = options.cellSize ?? 12;
  const gap = options.gap ?? 2;
  const lookup = options.values;
  const valueFor = (date: string): number | null => {
    const v =
      lookup instanceof Map
        ? lookup.get(date)
        : (lookup as Record<string, number> | undefined)?.[date];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const offset = (new Date(start).getUTCDay() - weekStartsOn + 7) % 7;
  const cells: CalendarCell[] = [];
  const months: { month: string; week: number }[] = [];
  for (let t = start, i = 0; t <= end; t += DAY_MS, i++) {
    const date = new Date(t).toISOString().slice(0, 10);
    const week = Math.floor((i + offset) / 7);
    const weekday = (i + offset) % 7;
    if (date.endsWith('-01') || i === 0) months.push({ month: date.slice(0, 7), week });
    cells.push({
      date,
      week,
      weekday,
      value: valueFor(date),
      x: week * (size + gap),
      y: weekday * (size + gap),
      size,
    });
  }
  const weeks = cells.length === 0 ? 0 : (cells.at(-1) as CalendarCell).week + 1;
  return {
    cells,
    weeks,
    months,
    width: Math.max(0, weeks * (size + gap) - gap),
    height: cells.length === 0 ? 0 : 7 * (size + gap) - gap,
  };
}

export interface MatrixCell<R extends string = string, C extends string = string> {
  row: R;
  col: C;
  rowIndex: number;
  colIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MatrixLayoutOptions {
  width: number;
  height: number;
  gap?: number;
}

/** A rows × columns grid of equal cells filling the area (heatmaps, cohort tables). */
export function matrixLayout<R extends string, C extends string>(
  rows: readonly R[],
  cols: readonly C[],
  options: MatrixLayoutOptions
): { cells: MatrixCell<R, C>[]; cellWidth: number; cellHeight: number } {
  const gap = Math.max(0, options.gap ?? 1);
  const cellWidth = cols.length
    ? Math.max(0, (options.width - gap * (cols.length - 1)) / cols.length)
    : 0;
  const cellHeight = rows.length
    ? Math.max(0, (options.height - gap * (rows.length - 1)) / rows.length)
    : 0;
  const cells: MatrixCell<R, C>[] = [];
  rows.forEach((row, rowIndex) => {
    cols.forEach((col, colIndex) => {
      cells.push({
        row,
        col,
        rowIndex,
        colIndex,
        x: colIndex * (cellWidth + gap),
        y: rowIndex * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
      });
    });
  });
  return { cells, cellWidth, cellHeight };
}
