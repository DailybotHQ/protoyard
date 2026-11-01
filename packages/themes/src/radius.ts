// Internal (not re-exported from the package entry).

/**
 * A unitless zero radius as `0px`. In `calc(var(--tx-radius) + 4px)` a bare
 * `0` is a number, not a length, so the whole radius scale (Tailwind's
 * `rounded-*`, Texuli's own steps) would be invalid at computed-value time.
 * Texuli's library writes `0px` since 0.11.2 (gap G128); this keeps a custom
 * or imported theme's `radius: '0'` valid too.
 */
export function radiusLength(radius: string): string {
  return /^\s*[+-]?0*\.?0+\s*$/.test(radius) ? '0px' : radius;
}
