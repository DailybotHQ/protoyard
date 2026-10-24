// @protoyard/charts-ui/cartesian — Texuli cartesian charts + thin adapters.
import type { ChartFamily } from '../families.ts';

export const FAMILY = 'cartesian' satisfies ChartFamily;

export type { CartesianChartProps } from '@texuli/charts/cartesian';
// Direct Texuli extras
export { CartesianChart, StackedBarChart } from '@texuli/charts/cartesian';
export {
  type BarMode,
  type CartesianPoint,
  type CartesianSeries,
  chartFormatters,
  comboRoles,
  defaultSummary,
  seriesFromRows,
  tickFormatter,
  toTexuliSeries,
  type ValueUnit,
  valueFormatter,
  type XKind,
} from '../compat/series.ts';
export { default as AreaChart } from './AreaChart.svelte';
export { default as BarChart } from './BarChart.svelte';
export { default as ComboChart } from './ComboChart.svelte';
export { default as LineChart } from './LineChart.svelte';
export { default as ScatterChart } from './ScatterChart.svelte';
