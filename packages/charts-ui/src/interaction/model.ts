import { bisectX } from '@protoyard/charts/downsample';

/*
 * The data contract and pure helpers behind chart interaction: which point
 * is active, how keys and the pointer move it, which series are visible, and
 * where the tooltip goes. Charts map their data to pixel points and hand
 * them to InteractivePlot; nothing here knows about a specific chart type.
 */

/** One point in pixel space plus the values it shows. `y: null` is a gap (never focusable). */
export interface PlotPoint<D = unknown> {
  x: number;
  y: number | null;
  /** The x value (epoch ms, category…) for labels and the table. */
  xValue: number | string;
  /** The y value for labels and the table. */
  yValue: number | null;
  datum?: D;
}

export interface PlotSeries<D = unknown> {
  id: string;
  label: string;
  /** CSS color; defaults to the series' theme color. */
  color?: string;
  /** Sorted by x. */
  points: readonly PlotPoint<D>[];
}

export interface ChartFormatters {
  x: (value: number | string) => string;
  y: (value: number | null, seriesId: string) => string;
}

export interface ActivePoint {
  series: number;
  index: number;
}

export interface ChartSelection<D = unknown> {
  series: PlotSeries<D>;
  index: number;
  datum: D | undefined;
}

const defined = (p: PlotPoint | undefined) =>
  p !== undefined && p.y !== null && Number.isFinite(p.y);

/** The next defined point from `index` in direction `step` (±1), or `index` when there is none. */
export function stepIndex(points: readonly PlotPoint[], index: number, step: 1 | -1): number {
  for (let i = index + step; i >= 0 && i < points.length; i += step)
    if (defined(points[i])) return i;
  return index;
}

/** First (`edge` = 1) or last (`edge` = -1) defined point, or -1. */
export function edgeIndex(points: readonly PlotPoint[], edge: 1 | -1): number {
  const start = edge === 1 ? -1 : points.length;
  const i = stepIndex(points, start, edge);
  return i === start ? -1 : i;
}

/** The defined point nearest to pixel `x`, or -1. */
export function nearestIndex(points: readonly PlotPoint[], x: number): number {
  const i = bisectX(points, x);
  if (i < 0) return -1;
  if (defined(points[i])) return i;
  const left = stepIndex(points, i, -1);
  const right = stepIndex(points, i, 1);
  const candidates = [left, right].filter((j) => j !== i && defined(points[j]));
  if (candidates.length === 0) return -1;
  return candidates.reduce((best, j) =>
    Math.abs((points[j] as PlotPoint).x - x) < Math.abs((points[best] as PlotPoint).x - x)
      ? j
      : best
  );
}

/** Moves to the next visible series (`step` ±1), keeping the closest x. */
export function stepSeries(
  series: readonly PlotSeries[],
  hidden: ReadonlySet<string>,
  active: ActivePoint,
  step: 1 | -1
): ActivePoint {
  const x = series[active.series]?.points[active.index]?.x ?? 0;
  for (let s = active.series + step; s >= 0 && s < series.length; s += step) {
    const candidate = series[s] as PlotSeries;
    if (hidden.has(candidate.id)) continue;
    const index = nearestIndex(candidate.points, x);
    if (index >= 0) return { series: s, index };
  }
  return active;
}

/** The first visible series with a defined point, at its first point; null when nothing is plotted. */
export function firstActive(
  series: readonly PlotSeries[],
  hidden: ReadonlySet<string>
): ActivePoint | null {
  for (let s = 0; s < series.length; s++) {
    if (hidden.has((series[s] as PlotSeries).id)) continue;
    const index = edgeIndex((series[s] as PlotSeries).points, 1);
    if (index >= 0) return { series: s, index };
  }
  return null;
}

/** Toggles a series; refuses to hide the last visible one (returns the same set). */
export function toggleSeries(
  hidden: ReadonlySet<string>,
  id: string,
  ids: readonly string[]
): Set<string> {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id);
  else {
    const visible = ids.filter((other) => !next.has(other));
    if (visible.length <= 1 && visible.includes(id)) return new Set(hidden);
    next.add(id);
  }
  return next;
}

export interface Box {
  left: number;
  top: number;
}

/**
 * Tooltip placement inside `bounds`: right of the anchor, flipped left at the
 * right edge; above it, flipped below at the top edge; then clamped. The
 * anchor never ends up under the tooltip unless the box is larger than the frame.
 */
export function tooltipPosition(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  bounds: { width: number; height: number },
  offset = 12
): Box {
  let left = anchor.x + offset;
  if (left + size.width > bounds.width) left = anchor.x - offset - size.width;
  let top = anchor.y - offset - size.height;
  if (top < 0) top = anchor.y + offset;
  left = Math.max(0, Math.min(left, bounds.width - size.width));
  top = Math.max(0, Math.min(top, bounds.height - size.height));
  const covers =
    anchor.x >= left &&
    anchor.x <= left + size.width &&
    anchor.y >= top &&
    anchor.y <= top + size.height;
  if (covers) {
    // Clamping pushed the box over the point: move it to whichever side has room.
    const below = anchor.y + offset;
    top =
      below + size.height <= bounds.height ? below : Math.max(0, anchor.y - offset - size.height);
  }
  return { left, top };
}

/** Rows for the table fallback: one per distinct x, in order, with one cell per series. */
export function tableRows(
  series: readonly PlotSeries[]
): { xValue: number | string; cells: (number | null)[] }[] {
  const keys: (number | string)[] = [];
  const byKey = new Map<number | string, (number | null)[]>();
  series.forEach((s, k) => {
    for (const p of s.points) {
      let row = byKey.get(p.xValue);
      if (!row) {
        row = series.map(() => null);
        byKey.set(p.xValue, row);
        keys.push(p.xValue);
      }
      row[k] = p.yValue;
    }
  });
  const numeric = keys.every((k) => typeof k === 'number');
  if (numeric) (keys as number[]).sort((a, b) => a - b);
  return keys.map((xValue) => ({ xValue, cells: byKey.get(xValue) as (number | null)[] }));
}
