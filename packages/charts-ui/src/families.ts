/**
 * Chart families, one lazy subpath each (`@protoyard/charts-ui/<family>`).
 * The root entry never imports a family, so a prototype pays only for the
 * families its screens import.
 */
export const CHART_FAMILIES = [
  'cartesian',
  'part-whole',
  'matrix',
  'compact',
  'canvas',
  'geo',
] as const;

export type ChartFamily = (typeof CHART_FAMILIES)[number];
