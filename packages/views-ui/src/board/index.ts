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
export { default as BoardView } from './BoardView.svelte';
export { DRAG_THRESHOLD_PX, indexFromPointer } from './pointer.ts';
