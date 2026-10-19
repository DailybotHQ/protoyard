import {
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
  type GridColumnDef,
  type GridDensity,
  type GridValue,
  OPERATORS_BY_TYPE,
  type SavedView,
} from '@protoyard/views/grid';

/** A grid column: the engine's definition plus UI-only options. */
export interface DataGridColumn<T> extends GridColumnDef<T> {
  /** Cells can be edited inline (needs `onCommit`). */
  editable?: boolean;
  /** Display text for a value (default: by type). */
  format?: (value: GridValue, row: T) => string;
}

/** The view state the grid edits: everything in a saved view except its id and name. */
export type GridViewState = Pick<SavedView, 'columns' | 'sort' | 'groupBy' | 'filter' | 'density'>;

export const ROW_HEIGHT: Record<GridDensity, number> = {
  compact: 32,
  comfortable: 40,
  spacious: 52,
};

export function emptyView(): GridViewState {
  return { columns: [], sort: [], groupBy: null, filter: null, density: 'comfortable' };
}

/** Display text for a cell, by column type. */
export function formatValue<T>(column: DataGridColumn<T>, value: GridValue, row: T): string {
  if (column.format) return column.format(value, row);
  if (value === null || value === undefined || value === '') return '';
  if (column.type === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No';
  if (column.type === 'number' && typeof value === 'number') return value.toLocaleString('en');
  if (column.type === 'date') {
    const ms =
      value instanceof Date
        ? value.getTime()
        : typeof value === 'number'
          ? value
          : Date.parse(String(value));
    return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : String(value);
  }
  return String(value);
}

/** The value typed into an editor, converted for the column (`null` for an empty field). */
export function parseEditorValue<T>(column: DataGridColumn<T>, raw: string | boolean): GridValue {
  if (column.type === 'boolean') return raw === true || raw === 'true';
  if (raw === '') return null;
  if (column.type === 'number') return Number(raw);
  return String(raw);
}

/** The next sort after clicking a header: asc → desc → none; with `add`, it becomes another key. */
export function nextSort(
  sort: GridViewState['sort'],
  key: string,
  add: boolean
): GridViewState['sort'] {
  const current = sort.find((entry) => entry.key === key);
  const rest = add ? sort.filter((entry) => entry.key !== key) : [];
  if (!current) return [...rest, { key, direction: 'asc' }];
  if (current.direction === 'asc') return [...rest, { key, direction: 'desc' }];
  return rest;
}

// ── filter drafts ────────────────────────────────────────────────────────

export function newCondition<T>(columns: readonly GridColumnDef<T>[]): FilterCondition {
  const column = columns[0];
  const operator = column ? (OPERATORS_BY_TYPE[column.type][0] ?? 'eq') : 'eq';
  return {
    type: 'condition',
    field: column?.key ?? '',
    operator,
    value: column?.type === 'boolean' ? true : '',
  };
}

export function newGroup<T>(columns: readonly GridColumnDef<T>[]): FilterGroup {
  return { type: 'group', op: 'and', children: [newCondition(columns)] };
}

/** Replaces the node at `path` (child indexes from the root) with `next` (or removes it when null). */
export function updateAt(
  root: FilterNode,
  path: readonly number[],
  next: FilterNode | null
): FilterNode | null {
  if (path.length === 0) return next;
  if (root.type !== 'group') return root;
  const [head, ...rest] = path as [number, ...number[]];
  const children = root.children
    .map((child, i) => (i === head ? updateAt(child, rest, next) : child))
    .filter((child): child is FilterNode => child !== null);
  return { ...root, children };
}

/** A value of the right shape when the operator changes. */
export function valueFor<T>(
  column: GridColumnDef<T> | undefined,
  operator: FilterCondition['operator']
): FilterCondition['value'] {
  if (operator === 'isEmpty' || operator === 'isNotEmpty') return undefined;
  if (operator === 'in') return [];
  if (operator === 'between') return ['', ''];
  return column?.type === 'boolean' ? true : '';
}

/** Turns typed text into the scalar the engine expects for this column. */
export function typedScalar<T>(
  column: GridColumnDef<T> | undefined,
  raw: string
): string | number | boolean | null {
  if (!column || raw === '') return raw === '' ? '' : raw;
  if (column.type === 'number') return raw.trim() === '' ? '' : Number(raw);
  if (column.type === 'boolean') return raw === 'true';
  return raw;
}

const blank = (value: unknown) =>
  value === '' || value === undefined || (typeof value === 'number' && Number.isNaN(value));

/**
 * The filter without conditions still being typed (an empty value, an empty
 * list, an open range), and how many were left out. Empty groups go too.
 */
export function completeFilter(node: FilterNode | null): {
  node: FilterNode | null;
  incomplete: number;
} {
  if (!node) return { node: null, incomplete: 0 };
  if (node.type === 'condition') {
    if (node.operator === 'isEmpty' || node.operator === 'isNotEmpty')
      return { node, incomplete: 0 };
    const value = node.value;
    const open = Array.isArray(value)
      ? value.length === 0 || (node.operator === 'between' && value.some(blank))
      : blank(value);
    return open ? { node: null, incomplete: 1 } : { node, incomplete: 0 };
  }
  let incomplete = 0;
  const children: FilterNode[] = [];
  for (const child of node.children) {
    const kept = completeFilter(child);
    incomplete += kept.incomplete;
    if (kept.node) children.push(kept.node);
  }
  return { node: children.length ? { ...node, children } : null, incomplete };
}
