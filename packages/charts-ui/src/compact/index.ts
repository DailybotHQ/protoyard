// @protoyard/charts-ui/compact — Sparkline, gauge and radial progress for tiles and table cells.
// Each one carries a text equivalent instead of the full keyboard layer, so it stays small.
import type { ChartFamily } from '../families.ts';

export const FAMILY = 'compact' satisfies ChartFamily;

export { default as Gauge } from './Gauge.svelte';
export { default as RadialProgress } from './RadialProgress.svelte';
export { default as Sparkline } from './Sparkline.svelte';
export { type TrendSummary, trendLabel, trendSummary } from './trend.ts';
