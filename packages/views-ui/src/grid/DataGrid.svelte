<script lang="ts" generics="T">
/**
 * Host adapter over `@texuli/data/grid-core` `DataGrid`: liveQuery `query` → rows.
 * Advanced host toolkit (FilterBuilder, SavedViews, …) stays as separate exports
 * when still needed; the grid body is Texuli.
 */
import { type DataGridColumn, DataGrid as TexuliGrid } from '@texuli/data/grid-core';
import type { Snippet } from 'svelte';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  columns,
  getRowId,
  caption = 'Data',
  captionHidden = false,
  sort = $bindable([]),
  search = $bindable(''),
  searchable = false,
  filter,
  selectable = false,
  selected = $bindable<string[]>([]),
  onSelectionChange,
  onSortChange,
  onRowActivate,
  onCommit: _onCommit,
  cell,
  empty,
  onRetry,
  maxBlockSize,
  density = 'default',
  locale = 'en-US',
  class: className,
  ..._rest
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  columns: readonly DataGridColumn<T>[];
  getRowId: (row: T) => string;
  caption?: string;
  captionHidden?: boolean;
  sort?: { key: string; direction: 'asc' | 'desc' }[];
  search?: string;
  searchable?: boolean;
  filter?: unknown;
  selectable?: boolean;
  selected?: string[];
  onSelectionChange?: (selected: string[]) => void;
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' }[]) => void;
  onRowActivate?: (row: T) => void;
  onCommit?: (row: T, key: string, value: never) => unknown;
  cell?: Snippet<[T, DataGridColumn<T>]>;
  empty?: Snippet;
  onRetry?: () => void | Promise<void>;
  maxBlockSize?: string;
  density?: 'compact' | 'default' | 'comfortable';
  locale?: string;
  class?: string;
  [key: string]: unknown;
} = $props();
</script>

<QueryState {query} label={`Loading ${caption.toLowerCase()}`} {onRetry} isEmpty={() => false}>
  {#snippet children(rows)}
    <TexuliGrid
      {rows}
      {columns}
      {getRowId}
      {caption}
      {captionHidden}
      bind:sort
      bind:search
      {searchable}
      {filter}
      {selectable}
      bind:selected
      {onSelectionChange}
      {onSortChange}
      {onRowActivate}
      {cell}
      {empty}
      loading={query.loading}
      {maxBlockSize}
      {density}
      {locale}
      class={className}
    />
  {/snippet}
</QueryState>
