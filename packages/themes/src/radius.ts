// Internal (not re-exported from the package entry): a Texuli 0.10 adapter.

/**
 * A unitless zero radius as `0px`. Texuli 0.10's ported library writes `'0'`
 * for square themes (brutalist-block, velvet-shop; Texuli gap G128), and in
 * `calc(var(--tx-radius) + 4px)` a bare `0` is a number, not a length, so the
 * whole radius scale (Tailwind's `rounded-*`, Texuli's own steps) would be
 * invalid at computed-value time.
 */
export function radiusLength(radius: string): string {
  return /^\s*[+-]?0*\.?0+\s*$/.test(radius) ? '0px' : radius;
}
