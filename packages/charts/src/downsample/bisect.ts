/*
 * Binary search over x-sorted data for crosshairs and tooltips: O(log n)
 * per pointer move, so hovering a 100k-point series stays well under a frame.
 */

/** Sorted x values, or points with an `x`. */
export type XSource = ArrayLike<number> | readonly { readonly x: number }[];

function reader(source: XSource): (i: number) => number {
  const sample = source.length > 0 ? source[0] : undefined;
  if (typeof sample === 'object' && sample !== null) {
    const points = source as readonly { readonly x: number }[];
    return (i) => (points[i] as { x: number }).x;
  }
  const values = source as ArrayLike<number>;
  return (i) => values[i] as number;
}

/** First index whose x is `>= x` (insertion point); `length` when every x is smaller. */
export function bisectLeft(source: XSource, x: number): number {
  const at = reader(source);
  let lo = 0;
  let hi = source.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (at(mid) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the sample whose x is nearest to `x` (ties go left); -1 when empty. */
export function bisectX(source: XSource, x: number): number {
  const n = source.length;
  if (n === 0 || Number.isNaN(x)) return -1;
  const at = reader(source);
  const i = bisectLeft(source, x);
  if (i <= 0) return 0;
  if (i >= n) return n - 1;
  return x - at(i - 1) <= at(i) - x ? i - 1 : i;
}
