/**
 * `@protoyard/views/board` — the framework-free board engine: fractional rank
 * keys, columns × swimlanes grouping, WIP limits, move validation and a
 * keyboard drag state machine. `@protoyard/views-ui/board` renders it.
 * Everything here is pure; persisting a move is the prototype's service job
 * (policy, zod, `environment.run`, one transaction), and services must
 * enforce hard WIP limits too.
 */
export {
  type BoardCell,
  type BoardColumnDef,
  type BoardGrid,
  type BoardLaneDef,
  type BoardMove,
  type BoardOptions,
  type BoardPosition,
  DEFAULT_LANE,
  evaluateWip,
  groupBoard,
  type MoveResult,
  type MoveRules,
  type MoveTarget,
  validateMove,
  type WipEvaluation,
  type WipLimit,
  type WipStatus,
} from './board.ts';
export {
  describePosition,
  IDLE,
  type KeyboardMoveState,
  type MoveIntentResult,
  type MoveKey,
  moveIntent,
  pickUp,
} from './keyboard.ts';
export { assertRank, compareRanks, isRank, RankError, rankBetween, rankSequence } from './rank.ts';
