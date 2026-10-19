import {
  type BoardGrid,
  type BoardMove,
  type BoardPosition,
  evaluateWip,
  type MoveRules,
  validateMove,
} from './board.ts';

/**
 * Keyboard drag for a board, as a pure state machine. Focus a card, press
 * Space or Enter to pick it up (`pickUp`), then feed every keydown to
 * `moveIntent`:
 *
 * | Key | Effect |
 * | --- | --- |
 * | ArrowLeft / ArrowRight | previous / next column |
 * | ArrowUp / ArrowDown | up / down inside the cell |
 * | Shift + ArrowUp / ArrowDown | previous / next lane |
 * | Home / End | first / last position in the cell |
 * | Space / Enter | drop (validated; a rejected drop keeps the card in hand) |
 * | Escape | cancel (the card goes back) |
 *
 * Each result carries an announcement for an `aria-live` region. Positions
 * count the cell without the held card, so "position 2 of 4" is where it lands.
 */

export type KeyboardMoveState =
  | { mode: 'idle' }
  | { mode: 'held'; itemId: string; origin: BoardPosition; target: BoardPosition };

export const IDLE: KeyboardMoveState = { mode: 'idle' };

export interface MoveKey {
  key: string;
  shiftKey?: boolean;
}

export interface MoveIntentResult {
  state: KeyboardMoveState;
  /** False when the key means nothing here; let it through (do not preventDefault). */
  handled: boolean;
  announcement?: string;
  /** Set on a successful drop: hand it to the service that persists the move. */
  commit?: BoardMove;
}

function cellSize<T>(grid: BoardGrid<T>, itemId: string, at: BoardPosition): number {
  const items = grid.cells[at.laneIndex]?.[at.columnIndex]?.items ?? [];
  return items.filter((item) => grid.options.id(item) !== itemId).length;
}

function labelOf<T>(grid: BoardGrid<T>, itemId: string): string {
  const at = grid.positions.get(itemId);
  const item = at ? grid.cells[at.laneIndex]?.[at.columnIndex]?.items[at.index] : undefined;
  return item === undefined ? itemId : (grid.options.label?.(item) ?? itemId);
}

/** "Doing, lane Mobile, position 2 of 4" (the lane is omitted on boards without lanes). */
export function describePosition<T>(grid: BoardGrid<T>, itemId: string, at: BoardPosition): string {
  const column = grid.columns[at.columnIndex]?.title ?? '';
  const lane = grid.lanes.length > 1 ? `, lane ${grid.lanes[at.laneIndex]?.title ?? ''}` : '';
  return `${column}${lane}, position ${at.index + 1} of ${cellSize(grid, itemId, at) + 1}`;
}

/** Picks up `itemId`; returns `handled: false` when it is not on the board. */
export function pickUp<T>(grid: BoardGrid<T>, itemId: string): MoveIntentResult {
  const origin = grid.positions.get(itemId);
  if (!origin) return { state: IDLE, handled: false };
  return {
    state: { mode: 'held', itemId, origin, target: origin },
    handled: true,
    announcement: `Picked up ${labelOf(grid, itemId)}. ${describePosition(grid, itemId, origin)}. Use the arrow keys to move, Space to drop, Escape to cancel.`,
  };
}

function moveTo<T>(
  grid: BoardGrid<T>,
  state: Extract<KeyboardMoveState, { mode: 'held' }>,
  next: BoardPosition
): MoveIntentResult {
  const size = cellSize(grid, state.itemId, next);
  const target = { ...next, index: Math.max(0, Math.min(next.index, size)) };
  const column = grid.columns[target.columnIndex];
  let announcement = describePosition(grid, state.itemId, target);
  // Warn while hovering a full column, so the rejected drop is no surprise.
  if (column && target.columnIndex !== state.origin.columnIndex) {
    const wip = evaluateWip(column, grid.columnCounts.get(column.id) ?? 0);
    if (wip.status === 'blocked') announcement += `. ${wip.reason} Dropping here is not allowed`;
  }
  return { state: { ...state, target }, handled: true, announcement: `${announcement}.` };
}

/** Applies one key to the keyboard drag. Pure: the caller stores the state. */
export function moveIntent<T>(
  grid: BoardGrid<T>,
  state: KeyboardMoveState,
  event: MoveKey,
  rules: MoveRules<T> = {}
): MoveIntentResult {
  if (state.mode !== 'held') return { state, handled: false };
  const { target } = state;
  const label = labelOf(grid, state.itemId);
  const lastColumn = grid.columns.length - 1;
  const lastLane = grid.lanes.length - 1;

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      const columnIndex = Math.max(0, Math.min(target.columnIndex + step, lastColumn));
      if (columnIndex === target.columnIndex) return edge(state, 'the last column that way');
      return moveTo(grid, state, { ...target, columnIndex });
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const step = event.key === 'ArrowUp' ? -1 : 1;
      if (event.shiftKey) {
        const laneIndex = Math.max(0, Math.min(target.laneIndex + step, lastLane));
        if (laneIndex === target.laneIndex) return edge(state, 'the last lane that way');
        return moveTo(grid, state, { ...target, laneIndex });
      }
      const index = Math.max(
        0,
        Math.min(target.index + step, cellSize(grid, state.itemId, target))
      );
      if (index === target.index) return edge(state, step < 0 ? 'the top' : 'the bottom');
      return moveTo(grid, state, { ...target, index });
    }
    case 'Home':
      return moveTo(grid, state, { ...target, index: 0 });
    case 'End':
      return moveTo(grid, state, { ...target, index: Number.MAX_SAFE_INTEGER });
    case ' ':
    case 'Spacebar':
    case 'Enter': {
      const column = grid.columns[target.columnIndex];
      const lane = grid.lanes[target.laneIndex];
      if (!column || !lane) return { state: IDLE, handled: true };
      const result = validateMove(
        grid,
        state.itemId,
        { columnId: column.id, laneId: lane.id, index: target.index },
        rules
      );
      if (!result.ok) {
        return { state, handled: true, announcement: `${result.reason} Still holding ${label}.` };
      }
      if (result.unchanged) {
        return {
          state: IDLE,
          handled: true,
          announcement: `Dropped ${label} in its original place.`,
        };
      }
      // The column may now be at its soft limit or full: say so after the drop.
      const warning = result.wip.status !== 'ok' ? ` ${result.wip.reason}` : '';
      return {
        state: IDLE,
        handled: true,
        commit: result.move,
        announcement: `Dropped ${label} in ${describePosition(grid, state.itemId, target)}.${warning}`,
      };
    }
    case 'Escape':
      return {
        state: IDLE,
        handled: true,
        announcement: `Move cancelled. ${label} is back in ${describePosition(grid, state.itemId, state.origin)}.`,
      };
    default:
      return { state, handled: false };
  }
}

function edge(state: KeyboardMoveState, where: string): MoveIntentResult {
  return { state, handled: true, announcement: `Already at ${where}.` };
}
