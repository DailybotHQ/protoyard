import { z } from 'zod';

/** How a column's values compare, filter and aggregate. */
export type GridValueType = 'text' | 'number' | 'date' | 'boolean' | 'enum';

export type GridValue = string | number | boolean | Date | null | undefined;

export interface GridColumnDef<T> {
  key: string;
  header: string;
  type: GridValueType;
  /** Reads the cell value (default `row[key]`). Dates may be `Date`, ISO strings or ms. */
  accessor?: (row: T) => GridValue;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Allowed values of an `enum` column, in display order. */
  options?: readonly string[];
}

export function readValue<T>(row: T, column: GridColumnDef<T>): GridValue {
  return column.accessor
    ? column.accessor(row)
    : ((row as Record<string, unknown>)[column.key] as GridValue);
}

/**
 * A value in comparable form: ms for dates, numbers, booleans as 0/1, strings
 * as-is; `null` for empty (undefined, null, '', NaN, invalid dates).
 */
export function normalize(value: GridValue, type: GridValueType): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'date') {
    const ms =
      value instanceof Date
        ? value.getTime()
        : typeof value === 'number'
          ? value
          : Date.parse(String(value));
    return Number.isFinite(ms) ? ms : null;
  }
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'boolean') return value === true || value === 'true' ? 1 : 0;
  return String(value);
}

const key = z.string().min(1).max(64);

export const ColumnStateSchema = z
  .array(
    z.strictObject({
      key,
      width: z.number().int().min(24).max(2000).optional(),
      pinned: z.enum(['left', 'right']).optional(),
      hidden: z.boolean().optional(),
    })
  )
  .max(200);
/** Column order, widths, pins and visibility: plain data, safe to persist. */
export type ColumnState = z.infer<typeof ColumnStateSchema>;

export const DEFAULT_COLUMN_WIDTH = 160;
const MIN_WIDTH = 48;

/** State listing every column in definition order, at its default width. */
export function defaultColumnState<T>(columns: readonly GridColumnDef<T>[]): ColumnState {
  return columns.map((column) => ({ key: column.key }));
}

function clampWidth<T>(column: GridColumnDef<T>, width: number): number {
  const min = Math.max(24, column.minWidth ?? MIN_WIDTH);
  const max = Math.min(2000, column.maxWidth ?? 2000);
  return Math.round(Math.max(min, Math.min(max, width)));
}

export interface ResolvedColumn<T> {
  def: GridColumnDef<T>;
  width: number;
  pinned?: 'left' | 'right';
}

export interface ResolvedColumns<T> {
  left: ResolvedColumn<T>[];
  center: ResolvedColumn<T>[];
  right: ResolvedColumn<T>[];
  /** Hidden columns, for the column menu. */
  hidden: GridColumnDef<T>[];
}

/**
 * Applies a state to the definitions: state order first, then any column the
 * state does not mention (new columns appear at the end); entries for columns
 * that no longer exist are ignored.
 */
export function resolveColumns<T>(
  columns: readonly GridColumnDef<T>[],
  state: ColumnState
): ResolvedColumns<T> {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const seen = new Set<string>();
  const result: ResolvedColumns<T> = { left: [], center: [], right: [], hidden: [] };
  const place = (def: GridColumnDef<T>, entry?: ColumnState[number]) => {
    seen.add(def.key);
    if (entry?.hidden) {
      result.hidden.push(def);
      return;
    }
    const resolved: ResolvedColumn<T> = {
      def,
      width: clampWidth(def, entry?.width ?? def.width ?? DEFAULT_COLUMN_WIDTH),
    };
    if (entry?.pinned) resolved.pinned = entry.pinned;
    (entry?.pinned === 'left'
      ? result.left
      : entry?.pinned === 'right'
        ? result.right
        : result.center
    ).push(resolved);
  };
  for (const entry of state) {
    const def = byKey.get(entry.key);
    if (def && !seen.has(def.key)) place(def, entry);
  }
  for (const def of columns) if (!seen.has(def.key)) place(def);
  return result;
}

function withEntry(
  state: ColumnState,
  columnKey: string,
  update: (entry: ColumnState[number]) => ColumnState[number]
): ColumnState {
  const exists = state.some((entry) => entry.key === columnKey);
  const base = exists ? state : [...state, { key: columnKey }];
  return base.map((entry) => (entry.key === columnKey ? update({ ...entry }) : entry));
}

/** Moves a column to `toIndex` in the state order (the UI's drag and its keyboard alternative). */
export function moveColumn(state: ColumnState, columnKey: string, toIndex: number): ColumnState {
  const from = state.findIndex((entry) => entry.key === columnKey);
  if (from < 0) return state;
  const next = [...state];
  const [entry] = next.splice(from, 1);
  next.splice(
    Math.max(0, Math.min(Math.trunc(toIndex), next.length)),
    0,
    entry as ColumnState[number]
  );
  return next;
}

export function resizeColumn<T>(
  state: ColumnState,
  columns: readonly GridColumnDef<T>[],
  columnKey: string,
  width: number
): ColumnState {
  const def = columns.find((column) => column.key === columnKey);
  if (!def) return state;
  return withEntry(state, columnKey, (entry) => ({ ...entry, width: clampWidth(def, width) }));
}

export function pinColumn(
  state: ColumnState,
  columnKey: string,
  side: 'left' | 'right' | null
): ColumnState {
  return withEntry(state, columnKey, ({ pinned: _pinned, ...entry }) =>
    side ? { ...entry, pinned: side } : entry
  );
}

export function setColumnHidden(
  state: ColumnState,
  columnKey: string,
  hidden: boolean
): ColumnState {
  return withEntry(state, columnKey, ({ hidden: _hidden, ...entry }) =>
    hidden ? { ...entry, hidden: true } : entry
  );
}

/**
 * Shows every column (the column chooser's "Show all"): each column is listed,
 * in its current order, with `hidden` removed. Columns missing from `state`
 * are appended in definition order.
 */
export function showAllColumns<T>(
  state: ColumnState,
  columns: readonly GridColumnDef<T>[]
): ColumnState {
  const known = new Set(columns.map((column) => column.key));
  const listed = state
    .filter((entry) => known.has(entry.key))
    .map(({ hidden: _hidden, ...entry }) => entry);
  const seen = new Set(listed.map((entry) => entry.key));
  return [...listed, ...columns.filter((c) => !seen.has(c.key)).map((c) => ({ key: c.key }))];
}
