<script lang="ts" generics="T">
/**
 * Host adapter over `@texuli/data/grid-core` `DataGrid`: liveQuery `query` → rows.
 * Extra host props (saved views, aggregates, height, label) are accepted for
 * prototype compatibility; advanced chrome still uses the local toolkit exports.
 */
import { type DataGridColumn, DataGrid as TexuliGrid } from '@texuli/data/grid-core';
import type { Snippet } from 'svelte';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  columns,
  getRowId,
  caption,
  label = 'Data',
  captionHidden = false,
  sort = $bindable([] as { key: string; direction: 'asc' | 'desc' }[]),
  search = $bindable(''),
  searchable = false,
  filter,
  selectable = false,
  selected = $bindable<string[]>([]),
  activeViewId = $bindable<string | null>(null),
  savedViews: _savedViews,
  aggregates: _aggregates,
  height: _height,
  class: className,
  onSelectionChange,
  onSortChange,
  onRowActivate,
  onRowOpen,
  onCommit: _onCommit,
  onCreateView: _onCreateView,
  onRenameView: _onRenameView,
  onDeleteView: _onDeleteView,
  onViewChange: _onViewChange,
  cell,
  empty,
  onRetry,
  maxBlockSize,
  density = 'default',
  locale = 'en-US',
  ..._rest
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  columns: readonly DataGridColumn<T>[] | readonly unknown[];
  getRowId: (row: T) => string;
  caption?: string;
  label?: string;
  captionHidden?: boolean;
  sort?: { key: string; direction: 'asc' | 'desc' }[];
  search?: string;
  searchable?: boolean;
  filter?: unknown;
  selectable?: boolean;
  selected?: string[];
  activeViewId?: string | null;
  savedViews?: unknown;
  aggregates?: unknown;
  height?: string;
  class?: string;
  onSelectionChange?: (selected: string[]) => void;
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' }[]) => void;
  onRowActivate?: (row: T) => void;
  onRowOpen?: (row: T) => void;
  onCommit?: (row: T, key: string, value: any) => unknown;
  onCreateView?: (...args: any[]) => unknown;
  onRenameView?: (...args: any[]) => unknown;
  onDeleteView?: (...args: any[]) => unknown;
  onViewChange?: (...args: any[]) => unknown;
  cell?: Snippet<[T, DataGridColumn<T>]>;
  empty?: Snippet;
  onRetry?: () => void | Promise<void>;
  maxBlockSize?: string;
  density?: 'compact' | 'default' | 'comfortable';
  locale?: string;
  [key: string]: unknown;
} = $props();

const resolvedCaption = $derived(caption ?? label);
void activeViewId;
</script>

<QueryState {query} label={`Loading ${resolvedCaption.toLowerCase()}`} {onRetry} isEmpty={() => false}>
  {#snippet children(rows)}
    <TexuliGrid
      {rows}
      columns={columns as never}
      {getRowId}
      caption={resolvedCaption}
      {captionHidden}
      bind:sort
      bind:search
      {searchable}
      {filter}
      {selectable}
      bind:selected
      {onSelectionChange}
      {onSortChange}
      onRowActivate={onRowActivate ?? onRowOpen}
      {cell}
      {empty}
      loading={query.loading}
      maxBlockSize={maxBlockSize ?? _height}
      {density}
      {locale}
      class={className}
    />
  {/snippet}
</QueryState>
