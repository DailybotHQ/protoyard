/**
 * `@protoyard/views/grid` — the framework-free data grid engine: 2D windowing
 * with measured sizes, serializable column state (order, width, pin, hidden),
 * stable multi-sort, grouping with count/sum/min/max, a zod-validated filter
 * AST compiled to closures, filter composition (canonical serialization,
 * facets, chips), row selection for bulk actions, and saved views that are
 * safe to store and import.
 * `@protoyard/views-ui/grid` renders it.
 */
export {
  type ColumnState,
  ColumnStateSchema,
  DEFAULT_COLUMN_WIDTH,
  defaultColumnState,
  type GridColumnDef,
  type GridValue,
  type GridValueType,
  moveColumn,
  normalize,
  pinColumn,
  type ResolvedColumn,
  type ResolvedColumns,
  readValue,
  resizeColumn,
  resolveColumns,
  setColumnHidden,
  showAllColumns,
} from './columns.ts';
export {
  compareScalars,
  type DescribeFilterOptions,
  describeFilter,
  describeValues,
  FILTER_OPERATOR_LABELS,
  type FilterChip,
  type FilterFacets,
  facetsFromFilter,
  filterFromFacets,
  filtersEqual,
  normalizeFilter,
  parseSerializedFilter,
  removeFilterAt,
  SERIALIZED_FILTER_MAX_BYTES,
  serializeFilter,
  setFacet,
  tidyFilter,
  toggleFacetValue,
} from './compose.ts';
export {
  compileFilter,
  exceedsFilterLimits,
  FILTER_LIMITS,
  FILTER_OPERATORS,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
  FilterNodeSchema,
  type FilterOperator,
  filterSchemaFor,
  OPERATORS_BY_TYPE,
} from './filter.ts';
export {
  AggregateSchema,
  flattenGroups,
  type GridAggregate,
  type GridDisplayRow,
  type GroupOptions,
  groupRows,
  type RowGroup,
} from './group.ts';
export {
  pruneSelection,
  type RowSelection,
  type SelectionState,
  selectionState,
  selectRange,
  setVisibleSelected,
  toggleRow,
} from './selection.ts';
export {
  type CompareOptions,
  compareNormalized,
  type GridSort,
  SortSchema,
  sortRows,
} from './sort.ts';
export {
  applyView,
  GRID_DENSITIES,
  type GridDensity,
  isViewModified,
  nextViewId,
  type SavedView,
  SavedViewSchema,
  sanitizeView,
  type ViewResult,
  type ViewState,
  viewStatesEqual,
} from './view.ts';
export {
  type Axis,
  type AxisOptions,
  type AxisWindow,
  createAxis,
  type GridWindow,
  type GridWindowOptions,
  type WindowItem,
  windowAxis,
  windowGrid,
} from './virtual.ts';
