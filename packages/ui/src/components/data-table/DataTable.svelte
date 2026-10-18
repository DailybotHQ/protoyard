<script lang="ts" generics="T">
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import Checkbox from '../checkbox/Checkbox.svelte';
import EmptyState from '../empty-state/EmptyState.svelte';
import Pagination from '../pagination/Pagination.svelte';
import Skeleton from '../skeleton/Skeleton.svelte';
import { formatValue, matchesQuery, readValue, sortRows } from './table-utils.ts';
import type { DataTableBulkActionContext, DataTableColumn, DataTableSort } from './types.ts';

interface Props {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T, index: number) => string;
  /** Current sort; click a sortable header to cycle asc → desc → none. */
  sort?: DataTableSort | null;
  search?: string;
  /** Column keys (or row property names) the search box matches against. */
  searchKeys?: string[];
  /** Custom search predicate; takes precedence over `searchKeys`. */
  searchFn?: (row: T, query: string) => boolean;
  searchPlaceholder?: string;
  /** Rows per page; `0` disables pagination. */
  pageSize?: number;
  page?: number;
  onRowClick?: (row: T) => void;
  /** Accessible description of a clickable row, e.g. `(row) => \`Open ${row.name}\``. */
  rowLabel?: (row: T) => string;
  rowClass?: (row: T) => string | undefined;
  loading?: boolean;
  /** Custom empty state; `query` is the active search text. */
  empty?: Snippet<[{ query: string }]>;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rendered next to the search box (selects, segmented filters…). */
  filters?: Snippet;
  /** Right-aligned toolbar actions (export, create…). */
  toolbar?: Snippet;
  /** Enables row checkboxes and page-level selection. */
  selectable?: boolean;
  /** Selected row IDs. Selection is keyed by `getRowId` and can include rows on other pages. */
  selected?: string[];
  /** Rendered while rows are selected. Receives all selected IDs and their source rows. */
  bulkActions?: Snippet<[DataTableBulkActionContext<T>]>;
  /** Accessible table name (rendered as a visually hidden caption). */
  caption?: string;
  class?: string;
}

let {
  columns,
  rows,
  getRowId,
  sort = $bindable(null),
  search = $bindable(''),
  searchKeys,
  searchFn,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  page = $bindable(1),
  onRowClick,
  rowLabel,
  rowClass,
  loading = false,
  empty,
  emptyTitle = 'No results',
  emptyDescription,
  filters,
  toolbar,
  selectable = false,
  selected = $bindable([]),
  bulkActions,
  caption,
  class: className,
}: Props = $props();

const searchable = $derived(Boolean(searchFn) || (searchKeys?.length ?? 0) > 0);
const filtered = $derived.by(() => {
  const query = search.trim();
  if (!searchable || !query) return rows;
  if (searchFn) return rows.filter((row) => searchFn(row, query));
  return rows.filter((row) => matchesQuery(row, query, columns, searchKeys ?? []));
});
const sorted = $derived(sortRows(filtered, columns, sort));
const pageCount = $derived(pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1);
const currentPage = $derived(Math.min(Math.max(1, page), pageCount));
const visible = $derived(
  pageSize > 0 ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize) : sorted
);
const rangeStart = $derived(
  sorted.length === 0 ? 0 : pageSize > 0 ? (currentPage - 1) * pageSize + 1 : 1
);
const rangeEnd = $derived(
  pageSize > 0 ? Math.min(sorted.length, currentPage * pageSize) : sorted.length
);
const skeletonRows = $derived(Math.min(pageSize > 0 ? pageSize : 5, 8));
let selection = $state(new Set(selected));
let selectionAnchor = $state<string | null>(null);
let pendingShiftClick = false;
const visibleIds = $derived(visible.map((row) => getRowId(row, rows.indexOf(row))));
const selectedOnPage = $derived(visibleIds.filter((id) => selection.has(id)).length);
const pageFullySelected = $derived(visibleIds.length > 0 && selectedOnPage === visibleIds.length);
const pagePartiallySelected = $derived(selectedOnPage > 0 && !pageFullySelected);
const selectedRows = $derived(rows.filter((row, index) => selection.has(getRowId(row, index))));

$effect(() => {
  const availableIds = new Set(rows.map((row, index) => getRowId(row, index)));
  const next = new Set(selected.filter((id) => availableIds.has(id)));
  const unchanged = next.size === selection.size && [...next].every((id) => selection.has(id));
  if (!unchanged) selection = next;

  const selectedIds = [...next];
  if (
    selectedIds.length !== selected.length ||
    selectedIds.some((id, index) => id !== selected[index])
  ) {
    selected = selectedIds;
  }
  if (selectionAnchor && !availableIds.has(selectionAnchor)) selectionAnchor = null;
});

$effect(() => {
  // Keep the bound page valid when filtering shrinks the result set.
  if (page !== currentPage) page = currentPage;
});

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' };
const hideClass = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

function cellClass(column: DataTableColumn<T>): string {
  return cn(alignClass[column.align ?? 'left'], column.hideBelow && hideClass[column.hideBelow]);
}

function toggleSort(key: string): void {
  if (!sort || sort.key !== key) sort = { key, direction: 'asc' };
  else if (sort.direction === 'asc') sort = { key, direction: 'desc' };
  else sort = null;
  page = 1;
}

function ariaSort(key: string): 'ascending' | 'descending' | undefined {
  if (sort?.key !== key) return undefined;
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

function isFromInteractive(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(
    'a, button, input, select, textarea, label, [role="menuitem"]'
  );
  return interactive !== null && interactive !== event.currentTarget;
}

function handleRowClick(event: MouseEvent, row: T): void {
  if (!onRowClick || isFromInteractive(event)) return;
  onRowClick(row);
}

function handleRowKeydown(event: KeyboardEvent, row: T): void {
  if (!onRowClick || event.target !== event.currentTarget) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onRowClick(row);
  }
}

function commitSelection(next: Set<string>): void {
  selection = next;
  selected = [...next];
}

function captureShiftKey(event: Event): void {
  pendingShiftClick = 'shiftKey' in event && Boolean(event.shiftKey);
}

function toggleRowSelection(id: string, checked: boolean, shiftKey: boolean): void {
  const next = new Set(selection);
  const anchorIndex = selectionAnchor ? visibleIds.indexOf(selectionAnchor) : -1;
  const rowIndex = visibleIds.indexOf(id);
  if (shiftKey && anchorIndex >= 0 && rowIndex >= 0) {
    const start = Math.min(anchorIndex, rowIndex);
    const end = Math.max(anchorIndex, rowIndex);
    for (const rangeId of visibleIds.slice(start, end + 1)) {
      if (checked) next.add(rangeId);
      else next.delete(rangeId);
    }
  } else if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }
  if (!shiftKey || anchorIndex < 0) selectionAnchor = id;
  commitSelection(next);
}

function togglePageSelection(checked: boolean | 'indeterminate'): void {
  const next = new Set(selection);
  for (const id of visibleIds) {
    if (checked === true) next.add(id);
    else next.delete(id);
  }
  selectionAnchor = null;
  commitSelection(next);
}
</script>

<div class={cn('flex flex-col gap-3', className)}>
  {#if searchable || filters || toolbar}
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {#if searchable}
          <div class="relative w-full sm:max-w-xs">
            <Search
              class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              bind:value={search}
              oninput={() => (page = 1)}
              placeholder={searchPlaceholder}
              aria-label={caption ? `Search ${caption}` : 'Search table'}
              class="flex h-9 min-h-touch w-full rounded-md border border-input bg-surface py-1 pr-3 pl-9 text-base text-foreground shadow-soft outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:min-h-0 sm:text-sm"
            />
          </div>
        {/if}
        {#if filters}<div class="flex flex-wrap items-center gap-2">{@render filters()}</div>{/if}
      </div>
      {#if toolbar}<div class="flex flex-wrap items-center gap-2">{@render toolbar()}</div>{/if}
    </div>
  {/if}

  {#if selectable && bulkActions && selection.size > 0}
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      {@render bulkActions({ selected: [...selected], rows: selectedRows })}
    </div>
  {/if}

  <div class="overflow-x-auto rounded-xl border border-border bg-surface shadow-soft">
    <table class="w-full border-collapse text-sm" aria-busy={loading || undefined}>
      {#if caption}<caption class="sr-only">{caption}</caption>{/if}
      <thead>
        <tr class="border-b border-border bg-muted/50">
          {#if selectable}
            <th scope="col" class="w-10 px-3 text-left">
              <Checkbox
                checked={pageFullySelected}
                indeterminate={pagePartiallySelected}
                disabled={loading || visibleIds.length === 0}
                onCheckedChange={togglePageSelection}
                aria-label="Select all rows on this page"
              />
            </th>
          {/if}
          {#each columns as column (column.key)}
            <th
              scope="col"
              aria-sort={column.sortable ? ariaSort(column.key) : undefined}
              class={cn(
                'h-10 px-4 text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase',
                cellClass(column),
                column.headerClass
              )}
            >
              {#if column.sortable}
                <button
                  type="button"
                  class={cn(
                    '-mx-2 inline-flex min-h-touch items-center gap-1.5 rounded-md px-2 py-1 uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0',
                    sort?.key === column.key && 'text-foreground'
                  )}
                  onclick={() => toggleSort(column.key)}
                >
                  {column.header}
                  {#if sort?.key === column.key}
                    {#if sort.direction === 'asc'}
                      <ArrowUp class="size-3.5" aria-hidden="true" />
                    {:else}
                      <ArrowDown class="size-3.5" aria-hidden="true" />
                    {/if}
                  {:else}
                    <ArrowUpDown class="size-3.5 opacity-50" aria-hidden="true" />
                  {/if}
                </button>
              {:else}
                {column.header}
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if loading}
          {#each { length: skeletonRows }, index (index)}
            <tr class="border-b border-border last:border-b-0">
              {#each columns as column (column.key)}
                <td class={cn('px-4 py-3', cellClass(column))}>
                  <Skeleton class="h-4 w-full max-w-40" />
                </td>
              {/each}
            </tr>
          {/each}
        {:else if visible.length === 0}
          <tr>
            <td colspan={columns.length + (selectable ? 1 : 0)}>
              {#if empty}
                {@render empty({ query: search })}
              {:else}
                <EmptyState
                  size="sm"
                  title={emptyTitle}
                  description={search.trim()
                    ? `Nothing matches “${search.trim()}”.`
                    : emptyDescription}
                />
              {/if}
            </td>
          </tr>
        {:else}
          {#each visible as row (getRowId(row, rows.indexOf(row)))}
            <tr
              class={cn(
                'border-b border-border transition-colors last:border-b-0',
                onRowClick &&
                  'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                rowClass?.(row)
              )}
              tabindex={onRowClick ? 0 : undefined}
              aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
              onclick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
              onkeydown={onRowClick ? (event) => handleRowKeydown(event, row) : undefined}
            >
              {#if selectable}
                {@const id = getRowId(row, rows.indexOf(row))}
                <td
                  class="w-10 px-3 py-3 align-middle"
                  onclickcapture={captureShiftKey}
                  onkeydowncapture={captureShiftKey}
                >
                  <Checkbox
                    checked={selection.has(id)}
                    onCheckedChange={(checked) => {
                      toggleRowSelection(id, checked, pendingShiftClick);
                      pendingShiftClick = false;
                    }}
                    aria-label={`Select row ${rowLabel?.(row) ?? id}`}
                  />
                </td>
              {/if}
              {#each columns as column (column.key)}
                <td class={cn('px-4 py-3 align-middle', cellClass(column), column.class)}>
                  {#if column.cell}
                    {@render column.cell(row)}
                  {:else}
                    {formatValue(readValue(row, column))}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  {#if !loading && (pageSize > 0 || searchable)}
    <div class="flex flex-col-reverse items-center justify-between gap-2 sm:flex-row">
      <p class="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {#if sorted.length === 0}
          0 results
        {:else if pageSize > 0 && pageCount > 1}
          Showing {rangeStart}–{rangeEnd} of {sorted.length}
        {:else}
          {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
        {/if}
      </p>
      {#if pageSize > 0 && pageCount > 1}
        <Pagination bind:page pageCount={pageCount} label={caption ? `${caption} pages` : 'Table pages'} />
      {/if}
    </div>
  {/if}
</div>
