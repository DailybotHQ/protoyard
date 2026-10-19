/**
 * Rounds a coordinate for SVG path strings: two decimals are below a device
 * pixel at any zoom a dashboard uses, and keep paths short and stable.
 */
export function roundCoord(value: number, digits = 2): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}
