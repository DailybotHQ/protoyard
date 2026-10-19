import {
  moveNode,
  parentIn,
  type TreeAccessors,
  type TreeIndex,
  type TreeMove,
  type TreeMoveResult,
} from '@protoyard/views/tree';

/** Where a pending (or just-saved) node shows until the data catches up. */
export interface TreePlacement {
  parentId: string | null;
  rank: string;
}

/** Pointer travel before a press becomes a drag. */
export const TREE_DRAG_THRESHOLD_PX = 4;

export type DropZone = 'before' | 'inside' | 'after';

/** Top quarter: before; bottom quarter: after; the middle: inside. */
export function dropZone(top: number, height: number, y: number): DropZone {
  const offset = y - top;
  if (offset < height / 4) return 'before';
  if (offset > (height * 3) / 4) return 'after';
  return 'inside';
}

/** The engine move for dropping `movingId` on `overId` in `zone`. */
export function dropMove<T>(
  tree: TreeIndex<T>,
  movingId: string,
  overId: string,
  zone: DropZone
): TreeMoveResult {
  if (zone === 'inside')
    return moveNode(tree, movingId, { parentId: overId, index: Number.MAX_SAFE_INTEGER });
  const parentId = parentIn(tree, overId);
  const others = (tree.children.get(parentId) ?? []).filter(
    (row) => tree.accessors.id(row) !== movingId
  );
  const at = others.findIndex((row) => tree.accessors.id(row) === overId);
  return moveNode(tree, movingId, { parentId, index: zone === 'before' ? at : at + 1 });
}

/** The placements a move produces: the node, plus re-ranked siblings. */
export function treePlacements(move: TreeMove): Record<string, TreePlacement> {
  const out: Record<string, TreePlacement> = {
    [move.id]: { parentId: move.parentId, rank: move.rank },
  };
  for (const entry of move.rerank ?? [])
    out[entry.id] = { parentId: move.parentId, rank: entry.rank };
  return out;
}

/** Accessors that read through `overrides`, so pending nodes show where they are going. */
export function treeAccessors<T>(
  base: TreeAccessors<T>,
  overrides: Readonly<Record<string, TreePlacement>>
): TreeAccessors<T> {
  return {
    id: base.id,
    parentId: (item) => {
      const placement = overrides[base.id(item)];
      return placement ? placement.parentId : base.parentId(item);
    },
    rank: (item) => overrides[base.id(item)]?.rank ?? base.rank(item),
  };
}

/** Overrides the data now matches, which can be dropped. */
export function settledOverrides<T>(
  base: TreeAccessors<T>,
  items: readonly T[],
  overrides: Readonly<Record<string, TreePlacement>>,
  pending: Readonly<Record<string, boolean>>
): string[] {
  const byId = new Map(items.map((item) => [base.id(item), item]));
  return Object.entries(overrides)
    .filter(([id, placement]) => {
      if (pending[id]) return false;
      const item = byId.get(id);
      return (
        !item || (base.parentId(item) === placement.parentId && base.rank(item) === placement.rank)
      );
    })
    .map(([id]) => id);
}
