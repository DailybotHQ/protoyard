import type { Margin, Rect } from '../types.ts';

/**
 * The plot area left inside a `width × height` frame after its margins
 * (axes, labels). Never negative, so a tiny container renders an empty plot
 * instead of inverted geometry.
 */
export function plotArea(width: number, height: number, margin: Margin): Rect {
  return {
    x: margin.left,
    y: margin.top,
    width: Math.max(0, width - margin.left - margin.right),
    height: Math.max(0, height - margin.top - margin.bottom),
  };
}
