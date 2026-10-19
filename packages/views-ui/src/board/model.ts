import type { BoardMove, BoardOptions } from '@protoyard/views/board';

/** Where an item shows while its move is pending (or after it, until the data catches up). */
export interface Placement {
  columnId: string;
  laneId: string;
  rank: string;
}

/** Pointer travel before a press becomes a drag, so a click still opens the card. */
export const DRAG_THRESHOLD_PX = 4;
/** Distance from the scroller's edge that starts auto-scrolling, and the speed. */
export const AUTO_SCROLL_EDGE_PX = 48;
export const AUTO_SCROLL_STEP_PX = 14;

/** The placements a move produces: the moved item, plus every re-ranked neighbor. */
export function placementsOf(move: BoardMove): Record<string, Placement> {
  const placements: Record<string, Placement> = {
    [move.itemId]: { columnId: move.columnId, laneId: move.laneId, rank: move.rank },
  };
  for (const entry of move.rerank ?? []) {
    placements[entry.itemId] = { columnId: move.columnId, laneId: move.laneId, rank: entry.rank };
  }
  return placements;
}

/**
 * Accessors that read through `overrides`, so `groupBoard` places pending
 * items where they are going instead of where the data still has them.
 */
export function withOverrides<T>(
  options: BoardOptions<T>,
  overrides: Readonly<Record<string, Placement>>
): BoardOptions<T> {
  const at = (item: T) => overrides[options.id(item)];
  return {
    ...options,
    column: (item) => at(item)?.columnId ?? options.column(item),
    lane: (item) => at(item)?.laneId ?? options.lane?.(item) ?? '',
    rank: (item) => at(item)?.rank ?? options.rank(item),
  };
}

/** Whether the data already shows an item where its override puts it (the override can go). */
export function settled<T>(options: BoardOptions<T>, item: T, placement: Placement): boolean {
  const lane = options.lanes?.length ? (options.lane?.(item) ?? '') : '';
  const target = options.lanes?.length ? placement.laneId : '';
  return (
    options.column(item) === placement.columnId &&
    lane === target &&
    options.rank(item) === placement.rank
  );
}

/**
 * The drop index inside a cell from the pointer's y: before the first card
 * whose vertical middle is below the pointer. `middles` are the other cards'
 * middles, top to bottom.
 */
export function indexFromPointer(middles: readonly number[], y: number): number {
  const index = middles.findIndex((middle) => y < middle);
  return index === -1 ? middles.length : index;
}

/** Horizontal auto-scroll speed for a pointer near the scroller's edges (negative = left). */
export function autoScrollDelta(x: number, left: number, right: number): number {
  if (x < left + AUTO_SCROLL_EDGE_PX) return -AUTO_SCROLL_STEP_PX;
  if (x > right - AUTO_SCROLL_EDGE_PX) return AUTO_SCROLL_STEP_PX;
  return 0;
}
