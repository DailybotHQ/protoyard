import type { ChartFamily } from '../families.ts';

export const FAMILY = 'matrix' satisfies ChartFamily;

export {
  BubbleChart,
  HeatmapChart,
  MatrixFrame,
  ScatterChart,
} from '@texuli/charts/matrix';
export { default as CalendarHeatmap } from './CalendarHeatmap.svelte';
export { default as CellPlot } from './CellPlot.svelte';
export { default as Heatmap } from './Heatmap.svelte';
export { default as Histogram } from './Histogram.svelte';
export { type Cell, type RampScale, rampScale } from './model.ts';
export { default as RampLegend } from './RampLegend.svelte';
