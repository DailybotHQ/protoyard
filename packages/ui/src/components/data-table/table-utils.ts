import type { DataTableColumn, DataTableSort, SortValue } from './types.ts';

export function readValue<T>(row: T, column: DataTableColumn<T>): SortValue {
  if (column.accessor) return column.accessor(row);
  const value = (row as Record<string, unknown>)[column.key];
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }
  return String(value);
}

export function formatValue(value: SortValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Empty values always sort last, regardless of direction. */
export function compareValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  if (typeof av === 'boolean' && typeof bv === 'boolean') return Number(av) - Number(bv);
  return collator.compare(String(av), String(bv));
}

export function sortRows<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  sort: DataTableSort | null
): T[] {
  if (!sort) return rows;
  const column = columns.find((c) => c.key === sort.key);
  if (!column) return rows;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: readValue(row, column) }))
    .sort((x, y) => {
      const xEmpty = x.value === null || x.value === undefined || x.value === '';
      const yEmpty = y.value === null || y.value === undefined || y.value === '';
      if (xEmpty || yEmpty) {
        if (xEmpty && yEmpty) return x.index - y.index;
        return xEmpty ? 1 : -1;
      }
      // Stable: ties keep their original order.
      return compareValues(x.value, y.value) * factor || x.index - y.index;
    })
    .map((entry) => entry.row);
}

export function matchesQuery<T>(
  row: T,
  query: string,
  columns: DataTableColumn<T>[],
  searchKeys: string[]
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return searchKeys.some((key) => {
    const column = columns.find((c) => c.key === key);
    const value = column ? readValue(row, column) : (row as Record<string, unknown>)[key];
    if (value === null || value === undefined) return false;
    const text = value instanceof Date ? value.toLocaleDateString() : String(value);
    return text.toLowerCase().includes(needle);
  });
}
