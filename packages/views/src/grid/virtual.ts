/**
 * Windowing for big grids: which rows and columns to render for a scroll
 * position. Each axis has a default size plus sparse measured sizes, kept as
 * sorted indices with prefix sums, so 100,000 rows cost nothing until some are
 * measured and lookups stay O(log n). The same idea as the chat virtualizer
 * in `@protoyard/ai-ui` (`virtual.ts`), generalized to two axes; the kits do
 * not import each other, so the logic is intentionally duplicated.
 */

export interface Axis {
  count: number;
  /** Sum of every size, in px. */
  total: number;
  sizeOf(index: number): number;
  /** Start of `index` (`offsetOf(count)` is `total`). */
  offsetOf(index: number): number;
  /** The index under `offset` (clamped to the axis). */
  indexAt(offset: number): number;
}

export interface AxisOptions {
  count: number;
  /** Default size of every item, in px. */
  size: number;
  /** Measured sizes that differ from `size`, by index. */
  sizes?: ReadonlyMap<number, number>;
}

export function createAxis(options: AxisOptions): Axis {
  const count = Math.max(0, Math.floor(options.count));
  const size = options.size > 0 && Number.isFinite(options.size) ? options.size : 1;
  const indices: number[] = [];
  for (const [index, measured] of options.sizes ?? []) {
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < count &&
      measured >= 0 &&
      measured !== size
    ) {
      indices.push(index);
    }
  }
  indices.sort((a, b) => a - b);
  // deltas[i]: total extra px of the measured items before indices[i].
  const deltas = [0];
  for (const index of indices) {
    deltas.push(
      (deltas[deltas.length - 1] as number) + ((options.sizes?.get(index) as number) - size)
    );
  }
  const measuredBefore = (index: number) => {
    let low = 0;
    let high = indices.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((indices[middle] as number) < index) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const offsetOf = (index: number) => {
    const at = Math.max(0, Math.min(Math.floor(index), count));
    return at * size + (deltas[measuredBefore(at)] as number);
  };
  const total = offsetOf(count);
  return {
    count,
    total,
    sizeOf: (index) => options.sizes?.get(index) ?? size,
    offsetOf,
    indexAt(offset) {
      if (count === 0) return 0;
      let low = 0;
      let high = count - 1;
      while (low < high) {
        const middle = (low + high + 1) >>> 1;
        if (offsetOf(middle) <= offset) low = middle;
        else high = middle - 1;
      }
      return low;
    },
  };
}

export interface WindowItem {
  index: number;
  /** Offset from the axis start, in px. */
  start: number;
  size: number;
}

export interface AxisWindow {
  /** First rendered index (inclusive). */
  start: number;
  /** Last rendered index (exclusive). */
  end: number;
  items: WindowItem[];
}

/** The items overlapping [scroll, scroll + viewport), plus `overscan` on each side. */
export function windowAxis(axis: Axis, scroll: number, viewport: number, overscan = 3): AxisWindow {
  if (axis.count === 0 || viewport <= 0) return { start: 0, end: 0, items: [] };
  const from = Math.max(0, Number.isFinite(scroll) ? scroll : 0);
  const first = axis.indexAt(from);
  const last = axis.indexAt(from + viewport - 1);
  const start = Math.max(0, first - overscan);
  const end = Math.min(axis.count, last + 1 + overscan);
  const items: WindowItem[] = [];
  for (let index = start; index < end; index++) {
    items.push({ index, start: axis.offsetOf(index), size: axis.sizeOf(index) });
  }
  return { start, end, items };
}

export interface GridWindowOptions {
  rows: Axis;
  /** The scrolling (unpinned) columns. */
  columns: Axis;
  scrollTop: number;
  scrollLeft: number;
  viewportHeight: number;
  /** Full viewport width; pinned widths are subtracted from it. */
  viewportWidth: number;
  /** Total width of the left- and right-pinned columns, always rendered. */
  pinnedLeftWidth?: number;
  pinnedRightWidth?: number;
  overscanRows?: number;
  overscanColumns?: number;
}

export interface GridWindow {
  rows: AxisWindow;
  columns: AxisWindow;
  /** Width of the scrolling region between the pinned columns. */
  centerWidth: number;
  totalHeight: number;
  totalWidth: number;
}

/** Rows and scrolling columns to render; pinned columns are always rendered. */
export function windowGrid(options: GridWindowOptions): GridWindow {
  const left = options.pinnedLeftWidth ?? 0;
  const right = options.pinnedRightWidth ?? 0;
  const centerWidth = Math.max(0, options.viewportWidth - left - right);
  return {
    rows: windowAxis(
      options.rows,
      options.scrollTop,
      options.viewportHeight,
      options.overscanRows ?? 3
    ),
    columns: windowAxis(
      options.columns,
      options.scrollLeft,
      centerWidth,
      options.overscanColumns ?? 1
    ),
    centerWidth,
    totalHeight: options.rows.total,
    totalWidth: left + options.columns.total + right,
  };
}
