<script lang="ts" generics="T">
import ArrowDown from '@lucide/svelte/icons/arrow-down';
import ArrowUp from '@lucide/svelte/icons/arrow-up';
import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Button } from 'texuli/button';
import { Checkbox } from 'texuli/choice';
import { cx } from 'texuli/cx';
import { Skeleton } from 'texuli/feedback';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Input } from 'texuli/input';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'texuli/table';
import EmptyState from '../empty-state/EmptyState.svelte';
import Pagination from '../pagination/Pagination.svelte';
import { formatValue, matchesQuery, readValue, sortRows } from './table-utils.ts';
import type { DataTableBulkActionContext, DataTableColumn, DataTableSort } from './types.ts';

interface OwnProps {
  /** The table's root element (toolbar, table and pager wrapper; bindable). */
  ref?: HTMLElement | null;
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

/** Extra attributes (`data-*`, `aria-*`, `id`, handlers…) land on the root element. */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps>;

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
  ref = $bindable(null),
  ...rest
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
  return cx(alignClass[column.align ?? 'left'], column.hideBelow && hideClass[column.hideBelow]);
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

<!--
  Texuli's table parts (`texuli/table`), Input, Button and Checkbox. Texuli's
  DataGrid (`@texuli/data/grid-core`, 0.8) covers table semantics
  (`mode="table"`), click activation, `hideBelow` and the empty query, but
  adopting it would change what consumers get: in table mode a row has no
  keyboard path of its own (Texuli gap G92; this one is a tab stop named by `rowLabel` that
  opens with Enter or Space), its search reads columns only (no `searchFn`,
  row keys outside the columns or placeholder), its pager is previous/next
  (not numbered pages), loading is a text row (not skeleton rows) and its
  sort is a multi-key list (not `{ key, direction } | null`).
-->
<div {...rest} bind:this={ref} class={cx('flex flex-col gap-3', className)}>
  {#if searchable || filters || toolbar}
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {#if searchable}
          <div class="ui-table-search w-full sm:max-w-xs">
            <Icon icon="search" size="sm" class="ui-table-search__icon" aria-hidden="true" />
            <Input
              type="search"
              bind:value={search}
              onValueChange={() => (page = 1)}
              placeholder={searchPlaceholder}
              aria-label={caption ? `Search ${caption}` : 'Search table'}
              class="ui-table-search__input"
            />
          </div>
        {/if}
        {#if filters}<div class="flex flex-wrap items-center gap-2">{@render filters()}</div>{/if}
      </div>
      {#if toolbar}<div class="flex flex-wrap items-center gap-2">{@render toolbar()}</div>{/if}
    </div>
  {/if}

  {#if selectable && bulkActions && selection.size > 0}
    <div class="ui-table-bulk">
      {@render bulkActions({ selected: [...selected], rows: selectedRows })}
    </div>
  {/if}

  <Table busy={loading} label={caption}>
    {#if caption}<TableCaption hidden>{caption}</TableCaption>{/if}
    <TableHeader>
      <TableRow>
        {#if selectable}
          <TableHead class="w-10">
            <Checkbox
              checked={pageFullySelected}
              indeterminate={pagePartiallySelected}
              disabled={loading || visibleIds.length === 0}
              onCheckedChange={togglePageSelection}
              aria-label="Select all rows on this page"
            />
          </TableHead>
        {/if}
        {#each columns as column (column.key)}
          <TableHead
            aria-sort={column.sortable ? ariaSort(column.key) : undefined}
            class={cx('whitespace-nowrap', cellClass(column), column.headerClass)}
          >
            {#if column.sortable}
              <Button
                variant="ghost"
                size="sm"
                class={cx('ui-table-sort', sort?.key === column.key && 'ui-table-sort--active')}
                onclick={() => toggleSort(column.key)}
              >
                {column.header}
                {#if sort?.key === column.key}
                  <LucideIcon icon={sort.direction === 'asc' ? ArrowUp : ArrowDown} size="xs" />
                {:else}
                  <LucideIcon icon={ArrowUpDown} size="xs" class="ui-table-sort__idle" />
                {/if}
              </Button>
            {:else}
              {column.header}
            {/if}
          </TableHead>
        {/each}
      </TableRow>
    </TableHeader>
    <TableBody>
      {#if loading}
        {#each { length: skeletonRows }, index (index)}
          <TableRow>
            {#each columns as column (column.key)}
              <TableCell class={cellClass(column)}>
                <Skeleton class="h-4 w-full max-w-40" />
              </TableCell>
            {/each}
          </TableRow>
        {/each}
      {:else if visible.length === 0}
        <TableRow>
          <TableCell colspan={columns.length + (selectable ? 1 : 0)}>
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
          </TableCell>
        </TableRow>
      {:else}
        {#each visible as row (getRowId(row, rows.indexOf(row)))}
          {@const id = getRowId(row, rows.indexOf(row))}
          <TableRow
            selected={selectable && selection.has(id)}
            class={cx(onRowClick && 'ui-table-row--action', rowClass?.(row))}
            tabindex={onRowClick ? 0 : undefined}
            aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
            onclick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
            onkeydown={onRowClick ? (event) => handleRowKeydown(event, row) : undefined}
          >
            {#if selectable}
              <TableCell class="w-10" onclickcapture={captureShiftKey} onkeydowncapture={captureShiftKey}>
                <Checkbox
                  checked={selection.has(id)}
                  onCheckedChange={(checked) => {
                    toggleRowSelection(id, checked, pendingShiftClick);
                    pendingShiftClick = false;
                  }}
                  aria-label={`Select row ${rowLabel?.(row) ?? id}`}
                />
              </TableCell>
            {/if}
            {#each columns as column (column.key)}
              <TableCell class={cx(cellClass(column), column.class)}>
                {#if column.cell}
                  {@render column.cell(row)}
                {:else}
                  {formatValue(readValue(row, column))}
                {/if}
              </TableCell>
            {/each}
          </TableRow>
        {/each}
      {/if}
    </TableBody>
  </Table>

  {#if !loading && (pageSize > 0 || searchable)}
    <div class="flex flex-col-reverse items-center justify-between gap-2 sm:flex-row">
      <p class="ui-table-count" aria-live="polite">
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

<style>
  .ui-table-search {
    position: relative;
  }
  .ui-table-search :global(.ui-table-search__icon) {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 0.75rem;
    translate: 0 -50%;
    color: var(--tx-muted-foreground, GrayText);
    pointer-events: none;
  }
  .ui-table-search :global(.ui-table-search__input) {
    padding-inline-start: 2.25rem;
  }
  .ui-table-bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--tx-border, ButtonBorder);
    border-radius: var(--tx-radius-lg, 0.5rem);
    background: var(--tx-muted, Canvas);
  }
  :global(.ui-table-sort) {
    margin-inline: -0.5rem;
    color: inherit;
    font: inherit;
    text-transform: inherit;
  }
  :global(.ui-table-sort--active) {
    color: var(--tx-foreground, CanvasText);
  }
  :global(.ui-table-sort__idle) {
    opacity: 0.5;
  }
  :global(.ui-table-row--action) {
    cursor: pointer;
  }
  :global(.ui-table-row--action:hover),
  :global(.ui-table-row--action:focus-visible) {
    background: var(--tx-muted, Canvas);
  }
  :global(.ui-table-row--action:focus-visible) {
    outline: var(--tx-focus-ring-width, 2px) solid var(--tx-ring, Highlight);
    outline-offset: -2px;
  }
  .ui-table-count {
    margin: 0;
    color: var(--tx-muted-foreground, GrayText);
    font-size: var(--tx-font-size-xs, 0.75rem);
    font-variant-numeric: tabular-nums;
  }
</style>
