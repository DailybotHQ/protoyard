<script lang="ts" generics="T">
import type { FilterNode, GridColumnDef } from '@protoyard/views/grid';
import BulkActionBar from './BulkActionBar.svelte';
import FacetPicker from './FacetPicker.svelte';
import FilterChips from './FilterChips.svelte';
import type { BulkAction } from './model.ts';

/**
 * The rows under the DataGrid toolbar that only some grids need: quick filter
 * pickers (facets), the active filter's chips and the bulk action bar. One
 * lazy chunk, loaded when the grid has facets, a filter or a selected row,
 * so plain grids never download it.
 */
let {
  columns,
  facets,
  filter,
  onFilter,
  rows,
  actions,
  onClear,
  label,
}: {
  columns: readonly GridColumnDef<T>[];
  /** Column keys with a facet picker. */
  facets: readonly string[];
  filter: FilterNode | null;
  onFilter: (next: FilterNode | null) => void;
  rows: readonly T[];
  actions: readonly BulkAction<T>[];
  onClear: () => void;
  label: string;
} = $props();
</script>

{#if facets.length > 0 || filter}
  <div class="flex flex-wrap items-center gap-2">
    {#each facets as key (key)}
      {@const column = columns.find((c) => c.key === key)}
      {#if column}<FacetPicker {column} value={filter} onchange={onFilter} />{/if}
    {/each}
    <FilterChips {columns} value={filter} onchange={onFilter} label={`${label} active filters`} />
  </div>
{/if}
{#if actions.length > 0}
  <BulkActionBar {rows} {actions} {onClear} label={`${label} bulk actions`} />
{/if}
