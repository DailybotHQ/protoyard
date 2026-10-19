import type { Extent } from '../types.ts';

/**
 * `[min, max]` of the finite values, ignoring `null`, `NaN` and infinities.
 * Returns `null` when nothing is finite, so callers choose their own empty
 * domain instead of plotting `[Infinity, -Infinity]`.
 */
export function extent(values: Iterable<number | null | undefined>): Extent | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? [min, max] : null;
}
