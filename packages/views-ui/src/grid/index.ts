/**
 * `@protoyard/views-ui/grid` — thin DataGrid adapter over Texuli grid-core,
 * grid-editing and grid-virtual, plus host filter/saved-view toolkit.
 */

export {
  DataGrid as TexuliDataGrid,
  type DataGridColumn as TexuliDataGridColumn,
  type DataGridLabels,
} from '@texuli/data/grid-core';
export {
  CellEditor,
  createUndoStack,
  type EditableColumn,
  EditableDataGrid,
  type UndoStack,
} from '@texuli/data/grid-editing';
export { VirtualDataGrid, virtualGridWindow } from '@texuli/data/grid-virtual';
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
