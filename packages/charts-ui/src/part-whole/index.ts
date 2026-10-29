// @protoyard/charts-ui/part-whole — Texuli part-whole + flow funnel/sankey adapters.
import type { ChartFamily } from '../families.ts';

export const FAMILY = 'part-whole' satisfies ChartFamily;

export { SunburstChart, TreemapChart } from '@texuli/charts/part-whole';
export { default as DonutChart } from './DonutChart.svelte';
export { default as FunnelChart } from './FunnelChart.svelte';
export {
  type FunnelChartStep,
  formatShare,
  type GroupedSlice,
  groupSmallSlices,
  type Slice,
} from './model.ts';
export { default as PieChart } from './PieChart.svelte';
export { default as SankeyChart } from './SankeyChart.svelte';
export { default as Treemap } from './Treemap.svelte';
