/**
 * `@protoyard/views/board` — framework-free board engine (ranks, WIP, moves,
 * keyboard). Math matches `@texuli/data` engines/board. The public
 * `@texuli/data/board` entry also exports `Board.svelte`, so this subpath keeps
 * the engine sources local for plain-Node package dist (no Svelte in engines).
 * `@protoyard/views-ui/board` renders it.
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
export {
  assertRank,
  compareRanks,
  isRank,
  RankError,
  rankBetween,
  rankSequence,
} from './rank.ts';
