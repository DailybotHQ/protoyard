/**
 * `@protoyard/blocks-ui/data` — stat/table/chart family.
 *
 * Chart blocks use `@protoyard/charts-ui` (AI ChartSpec). Texuli data blocks
 * (`@texuli/blocks/data`) use a different chart shape; this family is the
 * Protoyard ChartSpec adapter so decks and pages keep working.
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
