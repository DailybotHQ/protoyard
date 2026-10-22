import { z } from 'zod';
import { type ColumnState, ColumnStateSchema, type GridColumnDef } from './columns.ts';
import { filtersEqual } from './compose.ts';
import { compileFilter, type FilterNode, FilterNodeSchema, filterSchemaFor } from './filter.ts';
import { type GridAggregate, groupRows, type RowGroup } from './group.ts';
import { SortSchema, sortRows } from './sort.ts';

export const GRID_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type GridDensity = (typeof GRID_DENSITIES)[number];

/**
 * A saved grid view: plain, bounded data that is safe to store in IndexedDB
 * and to import from a snapshot (strict keys, length caps, a bounded filter).
 */
export const SavedViewSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  columns: ColumnStateSchema,
  sort: SortSchema,
  groupBy: z.string().min(1).max(64).nullable(),
  filter: FilterNodeSchema.nullable(),
  density: z.enum(GRID_DENSITIES),
});
export type SavedView = z.infer<typeof SavedViewSchema>;

export interface ViewResult<T> {
  /** Filtered and sorted rows. */
  rows: T[];
  /** Set when the view groups: the same rows, grouped. */
  groups: RowGroup<T>[] | null;
}

/** Filter → sort → group. Throws a `ZodError` if the view's filter does not fit the columns. */
export function applyView<T>(
  rows: readonly T[],
  view: Pick<SavedView, 'sort' | 'groupBy' | 'filter'>,
  columns: readonly GridColumnDef<T>[],
  options: { aggregates?: readonly GridAggregate[]; locale?: string } = {}
): ViewResult<T> {
  const filtered = view.filter ? rows.filter(compileFilter(view.filter, columns)) : [...rows];
  const sorted = sortRows(filtered, view.sort, columns, options);
  const groupBy =
    view.groupBy && columns.some((column) => column.key === view.groupBy) ? view.groupBy : null;
  return {
    rows: sorted,
    groups: groupBy ? groupRows(sorted, { by: groupBy, columns, ...options }) : null,
  };
}

function pruneFilter(
  node: FilterNode,
  check: (condition: FilterNode) => boolean,
  dropped: string[]
): FilterNode | null {
  if (node.type === 'condition') {
    if (check(node)) return node;
    dropped.push(`filter on ${node.field}`);
    return null;
  }
  const children = node.children
    .map((child) => pruneFilter(child, check, dropped))
    .filter((child): child is FilterNode => child !== null);
  return children.length > 0 ? { ...node, children } : null;
}

/**
 * Makes a stored view fit the current columns: entries, sort keys, grouping
 * and filter conditions for columns that no longer exist (or no longer fit)
 * are removed, and what was removed is listed. Throws a `ZodError` when the
 * input is not a view at all.
 */
export function sanitizeView<T>(
  input: unknown,
  columns: readonly GridColumnDef<T>[]
): { view: SavedView; dropped: string[] } {
  const view = SavedViewSchema.parse(input);
  const keys = new Set(columns.map((column) => column.key));
  const dropped: string[] = [];
  const keep = (key: string, what: string) => {
    if (keys.has(key)) return true;
    dropped.push(`${what} ${key}`);
    return false;
  };
  const fits = filterSchemaFor(columns);
  const filter = view.filter
    ? pruneFilter(view.filter, (condition) => fits.safeParse(condition).success, dropped)
    : null;
  return {
    view: {
      ...view,
      columns: view.columns.filter((entry) => keep(entry.key, 'column')),
      sort: view.sort.filter((entry) => keep(entry.key, 'sort on')),
      groupBy: view.groupBy && keep(view.groupBy, 'grouping by') ? view.groupBy : null,
      filter,
    },
    dropped,
  };
}

/** Everything a saved view stores except its id and name. */
export type ViewState = Pick<SavedView, 'columns' | 'sort' | 'groupBy' | 'filter' | 'density'>;

/** Column state without default-valued keys, so `{ key }` and `{ key, hidden: false }` compare equal. */
function columnsKey(columns: ColumnState): string {
  return JSON.stringify(
    columns.map((entry) => [
      entry.key,
      entry.width ?? null,
      entry.pinned ?? null,
      entry.hidden === true,
    ])
  );
}

/**
 * Whether two view states show the same thing: same columns (order, widths,
 * pins, visibility), sort, grouping, density and an equivalent filter (by
 * canonical form, so building the same filter in another order is no change).
 */
export function viewStatesEqual(a: ViewState, b: ViewState): boolean {
  return (
    a.density === b.density &&
    a.groupBy === b.groupBy &&
    JSON.stringify(a.sort) === JSON.stringify(b.sort) &&
    columnsKey(a.columns) === columnsKey(b.columns) &&
    filtersEqual(a.filter, b.filter)
  );
}

/** Whether `current` differs from the saved view it started from (the "Modified" badge). */
export function isViewModified(saved: ViewState, current: ViewState): boolean {
  return !viewStatesEqual(saved, current);
}

/**
 * A saved-view id derived from its name: lowercase kebab-case (at most 48
 * characters, `view` when the name has no letters or digits), with `-2`,
 * `-3`… appended until it is not in `existing`. Deterministic: the same name
 * and existing ids always give the same id.
 */
export function nextViewId(name: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '') || 'view';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}
