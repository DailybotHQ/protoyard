// @protoyard/analytics-ui/funnel — Funnel analysis view.
import type { AnalyticsView } from '../views.ts';

export const VIEW = 'funnel' satisfies AnalyticsView;

export { default as FunnelAnalysis } from './FunnelAnalysis.svelte';
export {
  ALL_USERS,
  type FunnelSeries,
  formatConversion,
  formatDuration,
  funnelSeries,
} from './model.ts';
