import type { Snippet } from 'svelte';

export type SortValue = string | number | boolean | Date | null | undefined;

export type SortDirection = 'asc' | 'desc';

export interface DataTableSort {
  key: string;
  direction: SortDirection;
}

export interface DataTableBulkActionContext<T> {
  /** IDs of every selected row, including rows on other pages or outside the current search. */
  selected: string[];
  /** Selected rows in the same order as the source `rows` prop. */
  rows: T[];
}

export interface DataTableColumn<T> {
  /** Unique column key; also the default property read from each row. */
  key: string;
  header: string;
  /** Custom cell renderer. Sorting/search still use `accessor` (or `row[key]`). */
  cell?: Snippet<[T]>;
  /** Value used for display (when no `cell`), sorting and search. */
  accessor?: (row: T) => SortValue;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Applied to body cells. */
  class?: string;
  headerClass?: string;
  /** Hide the column below a breakpoint to keep small screens readable. */
  hideBelow?: 'sm' | 'md' | 'lg';
}
