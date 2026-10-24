/**
 * `@protoyard/blocks-ui/data` — Texuli data family + ChartSpec adapter.
 */

export { toTexuliChartBlock } from '../compat/chart-spec.ts';
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
