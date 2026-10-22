/**
 * `@protoyard/blocks-ui/data` — the data family: a stat/KPI row (value, label,
 * delta with tone, context, optional sparkline), a data table (caption, scoped
 * headers, alignment, number, percent and integer-cents formatting) and a chart
 * block on `@protoyard/charts-ui` (the AI chart spec, re-validated; a table at
 * once, the cartesian or part-whole chart lazily, and a "View as table"
 * toggle). charts-ui families load as their own chunks.
 */
export { default as ChartBlock } from './ChartBlock.svelte';
export { default as BlockFamilyRenderer } from './DataBlock.svelte';
export {
  type ChartUnit,
  chartItems,
  chartSeries,
  chartValueFormatter,
  chartXKind,
  columnAlign,
  DATA_LOCALE,
  formatCents,
  formatTableCell,
  isCartesianChart,
  type TableColumnFormat,
  TONE_INDICATOR,
  TONE_LABELS,
} from './format.ts';
export { default as StatBlock } from './StatBlock.svelte';
export { default as TableBlock } from './TableBlock.svelte';
