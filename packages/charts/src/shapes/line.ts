import { roundCoord } from './round.ts';

/*
 * Line and area paths in pixel space (scale your data first). A point whose
 * y is null, NaN or rejected by `defined` is a gap: the line breaks there
 * and resumes at the next defined point, so missing data never draws as 0.
 */

export type Curve = 'linear' | 'monotone-x' | 'step' | 'step-before' | 'step-after';

export interface PathPoint {
  x: number;
  y: number | null;
}

export interface LinePathOptions<P extends PathPoint = PathPoint> {
  curve?: Curve;
  /** Extra gap rule, e.g. `(p) => p.y !== 0` to hide zeros. */
  defined?: (point: P, index: number) => boolean;
}

type Xy = readonly [number, number];

const fmt = (x: number, y: number) => `${roundCoord(x)},${roundCoord(y)}`;

/** Splits points into runs of defined points. */
function runs<P extends PathPoint>(
  points: readonly P[],
  defined?: (point: P, index: number) => boolean
): Xy[][] {
  const out: Xy[][] = [];
  let current: Xy[] = [];
  points.forEach((point, i) => {
    const ok =
      point.y !== null &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.x) &&
      (defined ? defined(point, i) : true);
    if (ok) current.push([point.x, point.y as number]);
    else if (current.length > 0) {
      out.push(current);
      current = [];
    }
  });
  if (current.length > 0) out.push(current);
  return out;
}

/** Tangents for a monotone cubic through `pts` (Fritsch–Carlson, as in d3's curveMonotoneX). */
function monotoneTangents(pts: readonly Xy[]): number[] {
  const n = pts.length;
  const t = new Array<number>(n).fill(0);
  if (n < 2) return t;
  const h = (i: number) => (pts[i + 1] as Xy)[0] - (pts[i] as Xy)[0];
  const s = (i: number) => {
    const dx = h(i);
    return dx === 0 ? 0 : ((pts[i + 1] as Xy)[1] - (pts[i] as Xy)[1]) / dx;
  };
  for (let i = 1; i < n - 1; i++) {
    const s0 = s(i - 1);
    const s1 = s(i);
    const h0 = h(i - 1);
    const h1 = h(i);
    const p = h0 + h1 === 0 ? 0 : (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] =
      (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) ||
      0;
  }
  const end = (i: number, slope: number, tangent: number) => {
    const dx = h(i);
    return dx === 0 ? tangent : (3 * slope - tangent) / 2;
  };
  t[0] = n === 2 ? s(0) : end(0, s(0), t[1] as number);
  t[n - 1] = n === 2 ? s(0) : end(n - 2, s(n - 2), t[n - 2] as number);
  return t;
}

/** Commands after the initial M for one run, from its first point to its last. */
function segment(pts: readonly Xy[], curve: Curve): string {
  let d = '';
  if (curve === 'monotone-x' && pts.length > 2) {
    const t = monotoneTangents(pts);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i] as Xy;
      const [x1, y1] = pts[i + 1] as Xy;
      const dx = (x1 - x0) / 3;
      d += `C${fmt(x0 + dx, y0 + dx * (t[i] as number))},${fmt(x1 - dx, y1 - dx * (t[i + 1] as number))},${fmt(x1, y1)}`;
    }
    return d;
  }
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] as Xy;
    const [x1, y1] = pts[i] as Xy;
    if (curve === 'step') {
      const mid = (x0 + x1) / 2;
      d += `L${fmt(mid, y0)}L${fmt(mid, y1)}`;
    } else if (curve === 'step-after') d += `L${fmt(x1, y0)}`;
    else if (curve === 'step-before') d += `L${fmt(x0, y1)}`;
    d += `L${fmt(x1, y1)}`;
  }
  return d;
}

/** SVG `d` for a line; `''` when nothing is defined. One-point runs draw as a zero-length segment (use round caps or a symbol). */
export function linePath<P extends PathPoint>(
  points: readonly P[],
  options: LinePathOptions<P> = {}
): string {
  const curve = options.curve ?? 'linear';
  return runs(points, options.defined)
    .map((run) => {
      const [x, y] = run[0] as Xy;
      return run.length === 1 ? `M${fmt(x, y)}Z` : `M${fmt(x, y)}${segment(run, curve)}`;
    })
    .join('');
}

export interface AreaPoint {
  x: number;
  /** Baseline (stack bottom); the plot's zero line for a plain area. */
  y0: number;
  /** Top; null or NaN is a gap. */
  y1: number | null;
}

export interface AreaPathOptions<P extends AreaPoint = AreaPoint> {
  curve?: Curve;
  defined?: (point: P, index: number) => boolean;
}

/** SVG `d` for an area between `y0` and `y1`; each defined run is its own closed shape. */
export function areaPath<P extends AreaPoint>(
  points: readonly P[],
  options: AreaPathOptions<P> = {}
): string {
  const curve = options.curve ?? 'linear';
  const tops: PathPoint[] = points.map((p) => ({ x: p.x, y: Number.isFinite(p.y0) ? p.y1 : null }));
  const defined = options.defined;
  let index = 0;
  const groups: [Xy[], Xy[]][] = [];
  let top: Xy[] = [];
  let bottom: Xy[] = [];
  for (const point of points) {
    const t = tops[index] as PathPoint;
    const ok =
      t.y !== null &&
      Number.isFinite(t.y) &&
      Number.isFinite(point.x) &&
      (defined ? defined(point, index) : true);
    if (ok) {
      top.push([point.x, t.y as number]);
      bottom.push([point.x, point.y0]);
    } else if (top.length > 0) {
      groups.push([top, bottom]);
      top = [];
      bottom = [];
    }
    index++;
  }
  if (top.length > 0) groups.push([top, bottom]);
  return groups
    .map(([upper, lower]) => {
      const [x, y] = upper[0] as Xy;
      const back = [...lower].reverse();
      const [bx, by] = back[0] as Xy;
      return `M${fmt(x, y)}${segment(upper, curve)}L${fmt(bx, by)}${segment(back, curve === 'step-after' ? 'step-before' : curve === 'step-before' ? 'step-after' : curve)}Z`;
    })
    .join('');
}
