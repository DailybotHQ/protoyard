/** Fewest points kept when a series is downsampled. */
export const MIN_DOWNSAMPLE_POINTS = 200;
/** Most points kept; beyond this a canvas renderer is the better tool. */
export const MAX_DOWNSAMPLE_POINTS = 4000;

/**
 * How many points a line of `plotWidthPx` pixels needs: two per pixel column
 * keeps peaks visible, clamped to [MIN_DOWNSAMPLE_POINTS, MAX_DOWNSAMPLE_POINTS].
 */
export function downsampleThreshold(plotWidthPx: number): number {
  const wanted = Number.isFinite(plotWidthPx) ? Math.ceil(plotWidthPx * 2) : 0;
  return Math.min(MAX_DOWNSAMPLE_POINTS, Math.max(MIN_DOWNSAMPLE_POINTS, wanted));
}
