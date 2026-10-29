import type { ChartFamily } from '../families.ts';

export const FAMILY = 'compact' satisfies ChartFamily;

export { BulletChart, ProgressRing } from '@texuli/charts/compact';
export { default as Gauge } from './Gauge.svelte';
export { default as RadialProgress } from './RadialProgress.svelte';
export { default as Sparkline } from './Sparkline.svelte';
export { type TrendSummary, trendLabel, trendSummary } from './trend.ts';
