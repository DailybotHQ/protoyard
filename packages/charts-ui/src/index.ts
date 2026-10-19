// Shared entry: family metadata and the data contract only. Chart components
// live on their family subpath so they stay out of initial bundles.
export type { ChartPoint, ChartSeries, Extent, Margin, Rect } from '@protoyard/charts';
export { CHART_FAMILIES, type ChartFamily } from './families.ts';
