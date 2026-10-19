// Shared entry: view metadata and the data contract only. KPI tiles land here
// (they are small enough for a first screen); every other view lives on its
// subpath so it stays out of initial bundles.
export type { AnalyticsEvent, Granularity, MetricPoint } from '@protoyard/analytics';
export { ANALYTICS_VIEWS, type AnalyticsView } from './views.ts';
