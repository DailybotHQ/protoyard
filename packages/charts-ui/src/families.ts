/**
 * Chart families, one lazy subpath each (`@protoyard/charts-ui/<family>`).
 * Rendering comes from `@texuli/charts` via thin adapters.
 */
export const CHART_FAMILIES = [
  'cartesian',
  'part-whole',
  'matrix',
  'compact',
  'canvas',
  'geo',
  'flow',
  'interaction',
] as const;

export type ChartFamily = (typeof CHART_FAMILIES)[number];
