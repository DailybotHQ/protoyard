import { compareRanks, isRank, rankBetween, rankSequence } from './rank.ts';

/** Work-in-progress limits for one column. Services must enforce them too. */
export interface WipLimit {
  /** At or above this count the column warns; moves still succeed. */
  soft?: number;
  /** The column holds at most this many items; moves into a full column are rejected. */
  hard?: number;
}

export interface BoardColumnDef {
  id: string;
  title: string;
  wip?: WipLimit;
}

export interface BoardLaneDef {
  id: string;
  title: string;
}

/** The single lane used when a board has no swimlanes. */
export const DEFAULT_LANE: BoardLaneDef = { id: '', title: '' };

export interface BoardOptions<T> {
  columns: readonly BoardColumnDef[];
  /** Swimlanes (rows). Omit for a board without lanes. */
  lanes?: readonly BoardLaneDef[];
  id: (item: T) => string;
  column: (item: T) => string;
  lane?: (item: T) => string;
  rank: (item: T) => string;
  /** Short human label used in announcements (defaults to the id). */
  label?: (item: T) => string;
}

export interface BoardCell<T> {
  columnId: string;
  laneId: string;
  /** Ordered by rank, then id (so equal or legacy ranks still sort the same way). */
  items: T[];
}

export interface BoardPosition {
  columnIndex: number;
  laneIndex: number;
  /** Index inside the cell. */
  index: number;
}

export interface BoardGrid<T> {
  columns: readonly BoardColumnDef[];
  lanes: readonly BoardLaneDef[];
  /** `cells[laneIndex][columnIndex]`. */
  cells: BoardCell<T>[][];
  /** Items per column across every lane (what WIP limits count). */
  columnCounts: ReadonlyMap<string, number>;
  /** Items whose column or lane is not on the board; shown by the UI, never dropped silently. */
  unplaced: T[];
  options: BoardOptions<T>;
  /** Where each placed item sits, by id. */
  positions: ReadonlyMap<string, BoardPosition>;
}

/** Groups items into columns × lanes, each cell ordered by rank. */
export function groupBoard<T>(items: readonly T[], options: BoardOptions<T>): BoardGrid<T> {
  const lanes = options.lanes && options.lanes.length > 0 ? options.lanes : [DEFAULT_LANE];
  const laneIndex = new Map(lanes.map((lane, i) => [lane.id, i]));
  const columnIndex = new Map(options.columns.map((column, i) => [column.id, i]));
  const cells = lanes.map((lane) =>
    options.columns.map(
      (column): BoardCell<T> => ({ columnId: column.id, laneId: lane.id, items: [] })
    )
  );
  const columnCounts = new Map(options.columns.map((column) => [column.id, 0]));
  const unplaced: T[] = [];
  const laneOf = options.lane && options.lanes?.length ? options.lane : () => DEFAULT_LANE.id;

  for (const item of items) {
    const c = columnIndex.get(options.column(item));
    const l = laneIndex.get(laneOf(item));
    if (c === undefined || l === undefined) {
      unplaced.push(item);
      continue;
    }
    cells[l]?.[c]?.items.push(item);
    const columnId = options.columns[c]?.id as string;
    columnCounts.set(columnId, (columnCounts.get(columnId) ?? 0) + 1);
  }

  const positions = new Map<string, BoardPosition>();
  cells.forEach((row, l) => {
    row.forEach((cell, c) => {
      cell.items.sort(
        (a, b) =>
          compareRanks(options.rank(a), options.rank(b)) ||
          compareRanks(options.id(a), options.id(b))
      );
      cell.items.forEach((item, index) => {
        positions.set(options.id(item), { columnIndex: c, laneIndex: l, index });
      });
    });
  });

  return { columns: options.columns, lanes, cells, columnCounts, unplaced, options, positions };
}

export type WipStatus = 'ok' | 'warn' | 'blocked';

export interface WipEvaluation {
  status: WipStatus;
  count: number;
  /** The limit the status refers to, if any. */
  limit?: number;
  /** Human sentence for warn and blocked. */
  reason?: string;
}

/**
 * The WIP state of `column` holding `count` items: `blocked` when it is full
 * (no item may enter), `warn` at or above the soft limit, else `ok`.
 */
export function evaluateWip(column: BoardColumnDef, count: number): WipEvaluation {
  const { soft, hard } = column.wip ?? {};
  if (hard !== undefined && count >= hard) {
    return { status: 'blocked', count, limit: hard, reason: wipSentence(column, count, hard, '') };
  }
  if (soft !== undefined && count >= soft) {
    return {
      status: 'warn',
      count,
      limit: soft,
      reason: wipSentence(column, count, soft, 'soft '),
    };
  }
  return { status: 'ok', count };
}

function wipSentence(column: BoardColumnDef, count: number, limit: number, kind: string): string {
  const state = count > limit ? 'is over' : 'has reached';
  return `${column.title} ${state} its ${kind}WIP limit (${count} of ${limit}).`;
}

export interface MoveTarget {
  columnId: string;
  /** Defaults to the item's current lane. */
  laneId?: string;
  /** Index in the target cell, counted without the moved item; clamped to the cell. */
  index: number;
}

export interface BoardMove {
  itemId: string;
  fromColumnId: string;
  fromLaneId: string;
  columnId: string;
  laneId: string;
  /** Position in the target cell after the move. */
  index: number;
  rank: string;
  /**
   * Set when the target cell's ranks could not be split (duplicate or invalid
   * keys from older data): fresh ranks for the whole cell, moved item included,
   * to write in the same transaction as the move.
   */
  rerank?: { itemId: string; rank: string }[];
}

export type MoveResult =
  | { ok: true; move: BoardMove; wip: WipEvaluation; unchanged: boolean }
  | { ok: false; reason: string };

export interface MoveRules<T> {
  /** Extra rule (permissions, required fields…): `false` or a reason string rejects. */
  canMove?: (item: T, target: { columnId: string; laneId: string }) => boolean | string;
}

/** Checks a move and computes the item's new rank. Pure: nothing is written. */
export function validateMove<T>(
  grid: BoardGrid<T>,
  itemId: string,
  target: MoveTarget,
  rules: MoveRules<T> = {}
): MoveResult {
  const { options } = grid;
  const from = grid.positions.get(itemId);
  if (!from) return { ok: false, reason: `Item ${itemId} is not on the board.` };
  const fromLane = grid.lanes[from.laneIndex] as BoardLaneDef;
  const fromColumn = grid.columns[from.columnIndex] as BoardColumnDef;
  const item = grid.cells[from.laneIndex]?.[from.columnIndex]?.items[from.index] as T;
  const label = options.label?.(item) ?? itemId;

  const columnIndex = grid.columns.findIndex((column) => column.id === target.columnId);
  const column = grid.columns[columnIndex];
  if (!column) return { ok: false, reason: `There is no column ${target.columnId}.` };
  const laneId = target.laneId ?? fromLane.id;
  const laneIndex = grid.lanes.findIndex((lane) => lane.id === laneId);
  if (laneIndex < 0) return { ok: false, reason: `There is no lane ${laneId}.` };

  const changesColumn = column.id !== fromColumn.id;
  const count = grid.columnCounts.get(column.id) ?? 0;
  // Within its own column an item never changes the count, so it is never blocked.
  if (changesColumn) {
    const entering = evaluateWip(column, count);
    if (entering.status === 'blocked') {
      return { ok: false, reason: `Cannot move ${label}: ${entering.reason}` };
    }
  }
  // What the column will hold after the move, for the UI's warning.
  const wip = evaluateWip(column, changesColumn ? count + 1 : count);
  const allowed = rules.canMove?.(item, { columnId: column.id, laneId }) ?? true;
  if (allowed !== true) {
    return {
      ok: false,
      reason: typeof allowed === 'string' ? allowed : `${label} cannot move to ${column.title}.`,
    };
  }

  const others = (grid.cells[laneIndex]?.[columnIndex]?.items ?? []).filter(
    (other) => options.id(other) !== itemId
  );
  const index = Math.max(0, Math.min(Math.trunc(target.index), others.length));
  const unchanged = !changesColumn && laneIndex === from.laneIndex && index === from.index;
  const before = index > 0 ? options.rank(others[index - 1] as T) : null;
  const after = index < others.length ? options.rank(others[index] as T) : null;

  const move: BoardMove = {
    itemId,
    fromColumnId: fromColumn.id,
    fromLaneId: fromLane.id,
    columnId: column.id,
    laneId,
    index,
    rank: options.rank(item),
  };
  if (unchanged) return { ok: true, move, wip, unchanged };

  const splittable =
    (before === null || isRank(before)) &&
    (after === null || isRank(after)) &&
    (before === null || after === null || before < after);
  if (splittable) {
    move.rank = rankBetween(before, after);
  } else {
    const ordered = [...others.slice(0, index), item, ...others.slice(index)];
    const ranks = rankSequence(ordered.length);
    move.rerank = ordered.map((entry, i) => ({
      itemId: options.id(entry),
      rank: ranks[i] as string,
    }));
    move.rank = ranks[index] as string;
  }
  return { ok: true, move, wip, unchanged };
}
