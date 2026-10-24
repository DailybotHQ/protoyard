/**
 * `@protoyard/views-ui/grid` — thin DataGrid adapter over `@texuli/data/grid-core`,
 * plus host filter/saved-view toolkit used by prototypes.
 */

export {
  DataGrid as TexuliDataGrid,
  type DataGridColumn as TexuliDataGridColumn,
  type DataGridLabels,
  gridRows,
  moveCell,
  nextSort as texuliNextSort,
} from '@texuli/data/grid-core';
export { default as BulkActionBar } from './BulkActionBar.svelte';
export { default as ColumnChooser } from './ColumnChooser.svelte';
export { default as DataGrid } from './DataGrid.svelte';
export { default as FacetPicker } from './FacetPicker.svelte';
export { default as FilterBuilder } from './FilterBuilder.svelte';
export { default as FilterChips } from './FilterChips.svelte';
export {
  type BulkAction,
  completeFilter,
  type DataGridColumn,
  emptyView,
  formatValue,
  type GridViewState,
  nextSort,
  parseEditorValue,
  ROW_HEIGHT,
  updateAt,
} from './model.ts';
export { default as SavedViews } from './SavedViews.svelte';
