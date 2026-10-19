// @protoyard/charts-ui/cartesian — line, area, bar, combo and scatter charts.
import type { ChartFamily } from '../families.ts';

export const FAMILY = 'cartesian' satisfies ChartFamily;

export { default as ChartFrame } from '../frame/ChartFrame.svelte';
export type { ChartSelection } from '../interaction/model.ts';
export { default as AreaChart } from './AreaChart.svelte';
export { default as BarChart } from './BarChart.svelte';
export { default as ComboChart } from './ComboChart.svelte';
export { default as LineChart } from './LineChart.svelte';
export {
  type BarMode,
  type CartesianPoint,
  type CartesianSeries,
  seriesFromRows,
  type ValueUnit,
  type XKind,
} from './model.ts';
export { default as ScatterChart } from './ScatterChart.svelte';
