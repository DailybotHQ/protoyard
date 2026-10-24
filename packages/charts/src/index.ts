/**
 * `@protoyard/charts` — chart math for Protoyard prototypes.
 *
 * Scales, shapes, layouts and downsampling are thin re-exports of
 * `@texuli/charts/math`. Chart palettes stay in this package (theme-token
 * derivation used by charts-ui).
 */
export * from './downsample/index.ts';
export * from './layout/index.ts';
export * from './palette/index.ts';
export * from './scales/index.ts';
export * from './shapes/index.ts';
export type { ChartPoint, ChartSeries, Extent, Margin, Rect } from './types.ts';
