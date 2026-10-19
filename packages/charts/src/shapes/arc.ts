import { roundCoord } from './round.ts';

/*
 * Pie/donut geometry. Angles are radians, 0 at 12 o'clock, growing
 * clockwise (x = sin a, y = −cos a), centered on (0, 0): translate the group.
 */

const TAU = Math.PI * 2;
const EPSILON = 1e-9;

export interface PieSlice {
  /** Index of the value in the input array. */
  index: number;
  value: number;
  startAngle: number;
  endAngle: number;
  /** Angular gap trimmed from this slice (half on each side). */
  padAngle: number;
}

export interface PieOptions {
  startAngle?: number;
  endAngle?: number;
  /** Gap between slices in radians. */
  padAngle?: number;
  /** Slice order around the circle; output stays in input order either way (default `none`). */
  sort?: 'none' | 'desc' | 'asc';
}

/** Angles for each value; negative and non-finite values get an empty slice. */
export function pie(values: readonly (number | null)[], options: PieOptions = {}): PieSlice[] {
  const start = options.startAngle ?? 0;
  const end = options.endAngle ?? TAU;
  const span = end - start;
  const clean = values.map((v) => (v !== null && Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  const order = clean.map((_, i) => i);
  if (options.sort === 'desc')
    order.sort((a, b) => (clean[b] as number) - (clean[a] as number) || a - b);
  if (options.sort === 'asc')
    order.sort((a, b) => (clean[a] as number) - (clean[b] as number) || a - b);
  const nonZero = clean.filter((v) => v > 0).length;
  const pad =
    nonZero > 1 ? Math.min(Math.abs(span) / nonZero, Math.max(0, options.padAngle ?? 0)) : 0;
  const slices = new Array<PieSlice>(clean.length);
  let angle = start;
  for (const i of order) {
    const v = clean[i] as number;
    const sweep = total === 0 ? 0 : (v / total) * span;
    slices[i] = {
      index: i,
      value: v,
      startAngle: angle,
      endAngle: angle + sweep,
      padAngle: v > 0 ? pad : 0,
    };
    angle += sweep;
  }
  return slices;
}

export interface ArcOptions {
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  /** Rounds the four corners; clamped to what the slice can fit. */
  cornerRadius?: number;
  /** Angular gap trimmed from the slice (half on each side), as `PieSlice.padAngle`. */
  padAngle?: number;
}

const point = (r: number, a: number) =>
  `${roundCoord(r * Math.sin(a))},${roundCoord(-r * Math.cos(a))}`;

/** Arc command from the current point along radius `r` to angle `a`. */
const arcTo = (r: number, sweep: number, a: number, clockwise: boolean) =>
  `A${roundCoord(r)},${roundCoord(r)},0,${Math.abs(sweep) > Math.PI ? 1 : 0},${clockwise ? 1 : 0},${point(r, a)}`;

/** SVG `d` for an annular sector (a pie slice when `innerRadius` is 0). `''` for an empty slice. */
export function arcPath(options: ArcOptions): string {
  const r0 = Math.max(0, Math.min(options.innerRadius, options.outerRadius));
  const r1 = Math.max(0, options.innerRadius, options.outerRadius);
  let a0 = Math.min(options.startAngle, options.endAngle);
  let a1 = Math.max(options.startAngle, options.endAngle);
  if (r1 <= 0 || a1 - a0 <= EPSILON) return '';

  if (a1 - a0 >= TAU - EPSILON) {
    // Full ring: two half circles, plus the hole drawn the other way (nonzero fill).
    const outer = `M0,${roundCoord(-r1)}A${roundCoord(r1)},${roundCoord(r1)},0,1,1,0,${roundCoord(r1)}A${roundCoord(r1)},${roundCoord(r1)},0,1,1,0,${roundCoord(-r1)}Z`;
    if (r0 <= 0) return outer;
    return `${outer}M0,${roundCoord(-r0)}A${roundCoord(r0)},${roundCoord(r0)},0,1,0,0,${roundCoord(r0)}A${roundCoord(r0)},${roundCoord(r0)},0,1,0,0,${roundCoord(-r0)}Z`;
  }

  const pad = Math.max(0, options.padAngle ?? 0) / 2;
  if (pad > 0) {
    a0 += pad;
    a1 -= pad;
    if (a1 - a0 <= EPSILON) return '';
  }
  const span = a1 - a0;
  const half = Math.sin(Math.min(span / 2, Math.PI / 2));
  let rc = Math.max(0, options.cornerRadius ?? 0);
  rc = Math.min(rc, (r1 - r0) / 2, (r1 * half) / (1 + half));
  if (r0 > 0 && half < 1) rc = Math.min(rc, (r0 * half) / (1 - half));

  if (rc <= EPSILON) {
    let d = `M${point(r1, a0)}${arcTo(r1, span, a1, true)}`;
    d += r0 > 0 ? `L${point(r0, a1)}${arcTo(r0, span, a0, false)}` : 'L0,0';
    return `${d}Z`;
  }

  // Outer corners: corner circle centred at r1 − rc, tangent to the rim and the radial edge.
  const outerOffset = Math.asin(rc / (r1 - rc));
  const outerEdge = Math.sqrt((r1 - rc) ** 2 - rc ** 2);
  const c = (r: number) => `${roundCoord(r)},${roundCoord(r)}`;
  let d = `M${point(outerEdge, a0)}`;
  d += `A${c(rc)},0,0,1,${point(r1, a0 + outerOffset)}`;
  d += arcTo(r1, span - 2 * outerOffset, a1 - outerOffset, true);
  d += `A${c(rc)},0,0,1,${point(outerEdge, a1)}`;
  if (r0 > 0) {
    const innerOffset = Math.asin(rc / (r0 + rc));
    const innerEdge = Math.sqrt((r0 + rc) ** 2 - rc ** 2);
    d += `L${point(innerEdge, a1)}`;
    d += `A${c(rc)},0,0,1,${point(r0, a1 - innerOffset)}`;
    d += arcTo(r0, span - 2 * innerOffset, a0 + innerOffset, false);
    d += `A${c(rc)},0,0,1,${point(innerEdge, a0)}`;
  } else {
    d += 'L0,0';
  }
  return `${d}Z`;
}

/** Midpoint of a slice at the middle radius: where a label goes. */
export function arcCentroid(
  options: Pick<ArcOptions, 'innerRadius' | 'outerRadius' | 'startAngle' | 'endAngle'>
): [number, number] {
  const r = (options.innerRadius + options.outerRadius) / 2;
  const a = (options.startAngle + options.endAngle) / 2;
  return [roundCoord(r * Math.sin(a)), roundCoord(-r * Math.cos(a))];
}
