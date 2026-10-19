import { minMaxBuckets } from '@protoyard/charts/downsample';

/*
 * The pure side of the Canvas renderer: when to use it, how to thin a line
 * to what a pixel column can show, a grid index for scatter hit testing, and
 * resolving CSS custom properties to colors a canvas can paint.
 */

export type Renderer = 'auto' | 'svg' | 'canvas';

/** Above this many drawn line points (all visible series, after downsampling), `auto` uses Canvas. */
export const CANVAS_LINE_POINTS = 5000;
/** Above this many visible scatter points, `auto` uses Canvas. */
export const CANVAS_SCATTER_POINTS = 2000;

export function useCanvas(renderer: Renderer, kind: 'line' | 'scatter', points: number): boolean {
  if (renderer === 'canvas') return true;
  if (renderer === 'svg') return false;
  return points > (kind === 'line' ? CANVAS_LINE_POINTS : CANVAS_SCATTER_POINTS);
}

export interface PixelPoint {
  x: number;
  y: number | null;
}

/**
 * Keeps the first, lowest, highest and last point per pixel column (gaps
 * kept), so a canvas line looks identical to drawing every point.
 */
export function reduceForPixels<P extends PixelPoint>(points: readonly P[], columns: number): P[] {
  if (points.length <= columns * 4) return [...points];
  const xs = new Float64Array(points.length);
  const ys = new Float64Array(points.length);
  points.forEach((p, i) => {
    xs[i] = p.x;
    ys[i] = p.y === null ? Number.NaN : p.y;
  });
  return minMaxBuckets(xs, ys, { buckets: Math.max(1, Math.ceil(columns)) }).map(
    (i) => points[i] as P
  );
}

/** A uniform grid over scatter points for O(1)-ish nearest-point lookups on pointer moves. */
export class ScatterIndex {
  readonly cell: number;
  private readonly cells = new Map<
    string,
    { series: number; index: number; x: number; y: number }[]
  >();

  constructor(series: readonly { points: readonly PixelPoint[]; hidden?: boolean }[], cell = 24) {
    this.cell = cell;
    series.forEach((s, k) => {
      if (s.hidden) return;
      s.points.forEach((p, i) => {
        if (p.y === null || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push({ series: k, index: i, x: p.x, y: p.y });
      });
    });
  }

  /** The closest point within `maxDistance` px of (x, y), or null. Looks at the 3×3 cells around it. */
  nearest(x: number, y: number, maxDistance = this.cell): { series: number; index: number } | null {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best: { series: number; index: number } | null = null;
    let bestD = maxDistance * maxDistance;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const p of this.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (d <= bestD) {
            bestD = d;
            best = { series: p.series, index: p.index };
          }
        }
      }
    }
    return best;
  }
}

/**
 * Resolves `var(--name, fallback)` (nested allowed) against an element's
 * computed style; plain colors pass through. Canvas cannot paint CSS variables.
 */
export function resolveColor(
  color: string,
  read: (name: string) => string,
  fallback = '#888888'
): string {
  const match = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(color.trim());
  if (!match) return color;
  const value = read(match[1] as string).trim();
  if (value) return value;
  return match[2] ? resolveColor(match[2], read, fallback) : fallback;
}

export interface CanvasLine {
  id: string;
  color: string;
  /** Every point of the series; CanvasMarks keeps first/min/max/last per pixel column. */
  points: readonly (PixelPoint & { y0?: number })[];
  dashed?: boolean;
  /** Fill down to each point's `y0` (areas and stacks). */
  fill?: boolean;
}

export interface CanvasDots {
  id: string;
  color: string;
  points: readonly (PixelPoint & { r: number })[];
}
