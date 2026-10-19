import { z } from 'zod';
import { type GridColumnDef, normalize, readValue } from './columns.ts';
import { compareNormalized } from './sort.ts';

export const AggregateSchema = z.strictObject({
  key: z.string().min(1).max(64),
  fn: z.enum(['count', 'sum', 'min', 'max']),
});
export type GridAggregate = z.infer<typeof AggregateSchema>;

export interface RowGroup<T> {
  /** Stable id for collapse state: the normalized key, or `∅` for empty values. */
  id: string;
  /** The normalized value the rows share (ms for dates; null for the empty group). */
  value: string | number | null;
  rows: T[];
  /** `${fn}:${key}` → result; `null` when no row had a value (sum of nothing is 0). */
  aggregates: Record<string, number | null>;
}

export interface GroupOptions<T> {
  by: string;
  columns: readonly GridColumnDef<T>[];
  aggregates?: readonly GridAggregate[];
  locale?: string;
}

/**
 * Groups rows by one column, keeping row order inside each group (sort first),
 * groups ordered by value with the empty group last. Unknown columns throw.
 */
export function groupRows<T>(rows: readonly T[], options: GroupOptions<T>): RowGroup<T>[] {
  const column = options.columns.find((c) => c.key === options.by);
  if (!column) throw new RangeError(`cannot group by unknown column "${options.by}"`);
  const groups = new Map<string | number | null, T[]>();
  for (const row of rows) {
    const value = normalize(readValue(row, column), column.type);
    const list = groups.get(value);
    if (list) list.push(row);
    else groups.set(value, [row]);
  }
  const aggregates = (options.aggregates ?? []).map((aggregate) => ({
    aggregate,
    column:
      aggregate.fn === 'count' ? undefined : options.columns.find((c) => c.key === aggregate.key),
  }));
  return [...groups.entries()]
    .sort(([a], [b]) => compareNormalized(a, b, options.locale))
    .map(([value, list]) => {
      const results: Record<string, number | null> = {};
      for (const { aggregate, column: target } of aggregates) {
        results[`${aggregate.fn}:${aggregate.key}`] = aggregateValues(list, aggregate.fn, target);
      }
      return { id: value === null ? '∅' : String(value), value, rows: list, aggregates: results };
    });
}

function aggregateValues<T>(
  rows: readonly T[],
  fn: GridAggregate['fn'],
  column: GridColumnDef<T> | undefined
): number | null {
  if (fn === 'count') return rows.length;
  if (!column) return null;
  let result: number | null = fn === 'sum' ? 0 : null;
  for (const row of rows) {
    const value = normalize(readValue(row, column), column.type === 'date' ? 'date' : 'number');
    if (typeof value !== 'number') continue;
    if (fn === 'sum') result = (result ?? 0) + value;
    else if (result === null || (fn === 'min' ? value < result : value > result)) result = value;
  }
  return result;
}

export type GridDisplayRow<T> =
  | { kind: 'group'; group: RowGroup<T>; collapsed: boolean }
  | { kind: 'row'; row: T; groupId: string };

/** Header rows plus the rows of open groups, as one list for the virtualizer. */
export function flattenGroups<T>(
  groups: readonly RowGroup<T>[],
  collapsed: ReadonlySet<string>
): GridDisplayRow<T>[] {
  const display: GridDisplayRow<T>[] = [];
  for (const group of groups) {
    const isCollapsed = collapsed.has(group.id);
    display.push({ kind: 'group', group, collapsed: isCollapsed });
    if (!isCollapsed)
      for (const row of group.rows) display.push({ kind: 'row', row, groupId: group.id });
  }
  return display;
}
