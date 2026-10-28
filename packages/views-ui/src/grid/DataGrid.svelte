<script lang="ts" generics="T">
/**
 * Host adapter over Texuli grid modules:
 * - `@texuli/data/grid-editing` `EditableDataGrid` when `onCommit` is set
 * - `@texuli/data/grid-virtual` `VirtualDataGrid` when virtualizing many rows
 * - `@texuli/data/grid-core` `DataGrid` otherwise
 * Plus a phone card list with "Show more" (md:hidden), matching prior Protoyard UX.
 */

import { Button } from '@protoyard/ui';
import type { GridValue, SavedView } from '@protoyard/views/grid';
import {
  type DataGridColumn as TexuliColumn,
  DataGrid as TexuliGrid,
} from '@texuli/data/grid-core';
import { type EditableColumn, EditableDataGrid } from '@texuli/data/grid-editing';
import { VirtualDataGrid } from '@texuli/data/grid-virtual';
import type { Snippet } from 'svelte';
import { cx } from 'texuli/cx';
import QueryState from '../states/QueryState.svelte';
import { type DataGridColumn, formatValue, type GridViewState } from './model.ts';

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
  height,
  class: className,
  onSelectionChange,
  onSortChange,
  onRowActivate,
  onRowOpen,
  onCommit,
  onApply,
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
  virtualizeAbove = 200,
  rowHeight = 36,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  columns: readonly DataGridColumn<T>[];
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
  savedViews?: readonly SavedView[] | unknown;
  aggregates?: unknown;
  height?: string;
  class?: string;
  onSelectionChange?: (selected: string[]) => void;
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' }[]) => void;
  onRowActivate?: (row: T) => void;
  onRowOpen?: (row: T) => void;
  onCommit?: (row: T, key: string, value: GridValue) => unknown;
  onApply?: (rowId: string, columnKey: string, value: GridValue) => void;
  onCreateView?: (name: string, view: GridViewState | unknown) => unknown;
  onRenameView?: (view: SavedView, name: string) => unknown;
  onDeleteView?: (view: SavedView) => unknown;
  onViewChange?: (view: GridViewState | unknown) => unknown;
  cell?: Snippet<[T, DataGridColumn<T>]>;
  empty?: Snippet;
  onRetry?: () => unknown;
  maxBlockSize?: string;
  density?: 'compact' | 'default' | 'comfortable';
  locale?: string;
  /** Use VirtualDataGrid above this many rows when not editing. */
  virtualizeAbove?: number;
  rowHeight?: number;
} = $props();

const resolvedCaption = $derived(caption ?? label);
const rows = $derived(query.current ?? []);
const useEditing = $derived(typeof onCommit === 'function');
const useVirtual = $derived(!useEditing && rows.length > virtualizeAbove);
let cardLimit = $state(50);

const selectedSet = $derived(new Set(selected));
const visibleColumns = $derived(columns.slice(0, 8));

function rowName(row: T): string {
  const first = columns[0];
  if (!first) return getRowId(row);
  return formatValue(first, (row as Record<string, unknown>)[first.key] as GridValue, row);
}

function cellText(row: T, column: DataGridColumn<T>): string {
  const raw = (row as Record<string, unknown>)[column.key];
  return formatValue(column, raw as GridValue, row);
}

void activeViewId;
</script>

<div class={cx('min-w-0', className)} data-grid={resolvedCaption}>
  <QueryState
    {query}
    label={`Loading ${resolvedCaption.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
    {#snippet children(data)}
      <!-- Desktop / tablet: Texuli grid modules -->
      <div class="hidden min-w-0 md:block">
        {#if useEditing && onCommit}
          <EditableDataGrid
            rows={data}
            columns={columns as readonly EditableColumn<T>[]}
            {getRowId}
            caption={resolvedCaption}
            {captionHidden}
            onCommit={async (row, key, value) => {
              await onCommit(row, key, value);
            }}
            {onApply}
            {searchable}
            {selectable}
            bind:selected
            {onSelectionChange}
            {density}
            class={className}
          />
        {:else if useVirtual}
          <VirtualDataGrid
            rows={data}
            columns={columns.map((c) => ({
              key: c.key,
              header: c.header,
              width: c.width,
            }))}
            {getRowId}
            caption={resolvedCaption}
            rowSize={rowHeight}
            viewportHeight={typeof height === 'string' && height.endsWith('px')
              ? Number.parseInt(height, 10)
              : 360}
            cellValue={(row, column) => {
              const col = columns.find((c) => c.key === column.key);
              return col ? cellText(row, col) : '';
            }}
            class={className}
          />
        {:else}
          <TexuliGrid
            rows={data}
            columns={columns as readonly TexuliColumn<T>[]}
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
            maxBlockSize={maxBlockSize ?? height}
            {density}
            {locale}
            class={className}
          />
        {/if}
      </div>

      <!-- Phones: same rows as cards with progressive "Show more". -->
      <ul class="grid gap-2 md:hidden" aria-label={resolvedCaption}>
        {#each data.slice(0, cardLimit) as row (getRowId(row))}
          {@const cardId = getRowId(row)}
          <li
            class={cx(
              'flex gap-3 rounded-lg border border-border p-3 text-sm',
              selectable && selectedSet.has(cardId) ? 'bg-primary/10' : 'bg-surface',
            )}
          >
            <Button
              type="button"
              class="min-w-0 flex-1 text-left"
              onclick={() => (onRowOpen ?? onRowActivate)?.(row)}
              disabled={!(onRowOpen || onRowActivate)}
            >
              <span class="block font-medium">{rowName(row)}</span>
              <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {#each visibleColumns.slice(1, 5) as c (c.key)}
                  <dt class="text-muted-foreground">{c.header}</dt>
                  <dd class="truncate">{cellText(row, c)}</dd>
                {/each}
              </dl>
            </Button>
          </li>
        {/each}
        {#if data.length > cardLimit}
          <li>
            <Button
              variant="outline"
              size="sm"
              class="w-full"
              onclick={() => (cardLimit += 50)}
            >
              Show more ({data.length - cardLimit} left)
            </Button>
          </li>
        {/if}
      </ul>
    {/snippet}
  </QueryState>
</div>
