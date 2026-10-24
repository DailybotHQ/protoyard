/**
 * `@protoyard/views/tree` — thin re-export of `@texuli/data/tree`
 * (index, flatten, cycle-safe moves, indent/outdent).
 * `@protoyard/views-ui/tree` renders it.
 */
export {
  buildTree,
  type FlatNode,
  type FlattenOptions,
  flatten,
  indent,
  isWithin,
  moveNode,
  moveSibling,
  newSibling,
  outdent,
  parentIn,
  pathTo,
  type TreeAccessors,
  type TreeIndex,
  type TreeMove,
  type TreeMoveResult,
  validParents,
} from '@texuli/data/tree';
