/**
 * `@protoyard/views-ui/board` — thin host adapter (`BoardView`) over
 * `@texuli/data` `Board`, plus engine helpers for consumers.
 */

export type {
  BoardCell,
  BoardColumnDef,
  BoardGrid,
  BoardLaneDef,
  BoardMove,
  BoardOptions,
  BoardPosition,
  KeyboardMoveState,
  MoveIntentResult,
  MoveKey,
  MoveResult,
  MoveRules,
  MoveTarget,
  WipEvaluation,
  WipLimit,
  WipStatus,
} from '@protoyard/views/board';
export {
  assertRank,
  compareRanks,
  DEFAULT_LANE,
  describePosition,
  evaluateWip,
  groupBoard,
  IDLE,
  isRank,
  moveIntent,
  pickUp,
  RankError,
  rankBetween,
  rankSequence,
  validateMove,
} from '@protoyard/views/board';
/** Alias used by existing tests and helpers. */
export type { BoardPlacement as Placement } from '@texuli/data/board';
export {
  Board,
  type BoardLabels,
  type BoardPlacement,
  placementsOf,
} from '@texuli/data/board';
/**
 * Index before the first item whose midpoint is past the pointer (sorted
 * midpoints). Texuli moved it out of `@texuli/data/board` into the shared drag
 * engine as `midpointIndex`; the old name stays for Protoyard callers.
 */
export { midpointIndex as indexFromPointer } from '@texuli/drag/collision';
/**
 * Pointer travel before a press becomes a drag, preserving ordinary clicks.
 * Matches the default `threshold` of `@texuli/drag/gesture`'s pointer tracker.
 */
export const DRAG_THRESHOLD_PX = 4;
export { default as BoardView } from './BoardView.svelte';
