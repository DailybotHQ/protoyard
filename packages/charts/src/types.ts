/**
 * Data contract shared by every chart. `x` is a number (epoch ms for time
 * axes, an index for categories); `y: null` marks a gap that breaks a line.
 */
export interface ChartPoint {
  x: number;
  y: number | null;
}

export interface ChartSeries {
  id: string;
  label: string;
  points: readonly ChartPoint[];
}

/** `[min, max]` of a domain. */
export type Extent = readonly [number, number];

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
