/**
 * `@protoyard/views/tree` — trees and outlines over `{ id, parentId, rank }`
 * rows: index, flatten (with ARIA level, position and set size), cycle-safe
 * moves, indent and outdent, sibling moves, new-sibling ranks and valid
 * parents. `@protoyard/views-ui/tree` renders it.
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
} from './tree.ts';
