import { compareRanks, isRank, rankBetween, rankSequence } from '../board/rank.ts';

/**
 * Trees and outlines over flat `{ id, parentId, rank }` rows (siblings are
 * ordered by board rank keys). Pure: a move returns the rows to write, and the
 * prototype's service persists them.
 */

export interface TreeAccessors<T> {
  id: (item: T) => string;
  parentId: (item: T) => string | null;
  rank: (item: T) => string;
}

export interface TreeIndex<T> {
  accessors: TreeAccessors<T>;
  byId: ReadonlyMap<string, T>;
  /** Children by parent id (`null` for roots), ordered by rank, then id. */
  children: ReadonlyMap<string | null, T[]>;
  /** The parent each node is placed under (null for roots and orphans). */
  parents: ReadonlyMap<string, string | null>;
}

/**
 * Indexes the rows. A row whose parent is missing, or that sits in a parent
 * cycle in older data, is treated as a root so it never disappears.
 */
export function buildTree<T>(rows: readonly T[], accessors: TreeAccessors<T>): TreeIndex<T> {
  const byId = new Map(rows.map((row) => [accessors.id(row), row]));
  const parentOf = (row: T): string | null => {
    const parent = accessors.parentId(row);
    if (parent === null || !byId.has(parent)) return null;
    // Walk up: a cycle back to this row makes it a root.
    const seen = new Set([accessors.id(row)]);
    for (let at: string | null = parent; at !== null; ) {
      if (seen.has(at)) return null;
      seen.add(at);
      const up = byId.get(at);
      const next = up ? accessors.parentId(up) : null;
      at = next !== null && byId.has(next) ? next : null;
    }
    return parent;
  };
  const children = new Map<string | null, T[]>();
  const parents = new Map<string, string | null>();
  for (const row of rows) {
    const parent = parentOf(row);
    parents.set(accessors.id(row), parent);
    const list = children.get(parent);
    if (list) list.push(row);
    else children.set(parent, [row]);
  }
  for (const list of children.values()) {
    list.sort(
      (a, b) =>
        compareRanks(accessors.rank(a), accessors.rank(b)) ||
        compareRanks(accessors.id(a), accessors.id(b))
    );
  }
  return { accessors, byId, children, parents };
}

/** The parent the index uses (null for roots, including orphans). */
export function parentIn<T>(tree: TreeIndex<T>, id: string): string | null {
  return tree.parents.get(id) ?? null;
}

export interface FlatNode<T> {
  item: T;
  id: string;
  parentId: string | null;
  /** 1-based, as `aria-level`. */
  level: number;
  hasChildren: boolean;
  expanded: boolean;
  /** 1-based position among siblings and their count, as `aria-posinset` / `aria-setsize`. */
  position: number;
  siblings: number;
}

export interface FlattenOptions<T> {
  /** Open nodes; `'all'` opens everything. */
  expanded: ReadonlySet<string> | 'all';
  /** Nodes with children that are not loaded yet (lazy trees) still count as parents. */
  hasChildren?: (item: T) => boolean;
}

/** The visible rows, depth first, honoring which nodes are open. */
export function flatten<T>(tree: TreeIndex<T>, options: FlattenOptions<T>): FlatNode<T>[] {
  const out: FlatNode<T>[] = [];
  const open = (id: string) => options.expanded === 'all' || options.expanded.has(id);
  const walk = (parent: string | null, level: number) => {
    const list = tree.children.get(parent) ?? [];
    list.forEach((item, i) => {
      const id = tree.accessors.id(item);
      const kids = tree.children.get(id);
      const hasChildren = (kids?.length ?? 0) > 0 || (options.hasChildren?.(item) ?? false);
      const expanded = hasChildren && open(id);
      out.push({
        item,
        id,
        parentId: parent,
        level,
        hasChildren,
        expanded,
        position: i + 1,
        siblings: list.length,
      });
      if (expanded) walk(id, level + 1);
    });
  };
  walk(null, 1);
  return out;
}

/** Whether `id` is `ancestorId` or lies anywhere below it. */
export function isWithin<T>(tree: TreeIndex<T>, ancestorId: string, id: string | null): boolean {
  for (let at = id; at !== null; at = parentIn(tree, at)) {
    if (at === ancestorId) return true;
  }
  return false;
}

/** Ancestor ids from the root down to the node's parent. */
export function pathTo<T>(tree: TreeIndex<T>, id: string): string[] {
  const path: string[] = [];
  for (let at = parentIn(tree, id); at !== null; at = parentIn(tree, at)) path.unshift(at);
  return path;
}

export interface TreeMove {
  id: string;
  parentId: string | null;
  rank: string;
  /** Fresh ranks for the whole sibling list when older ranks could not be split. */
  rerank?: { id: string; rank: string }[];
}

export type TreeMoveResult =
  | { ok: true; move: TreeMove; unchanged: boolean }
  | { ok: false; reason: string };

/** The rank for a node placed at `index` among `parentId`'s children (without `movingId`). */
function rankAt<T>(
  tree: TreeIndex<T>,
  parentId: string | null,
  index: number,
  movingId: string | null
): Pick<TreeMove, 'rank' | 'rerank'> {
  const { id: idOf, rank: rankOf } = tree.accessors;
  const siblings = (tree.children.get(parentId) ?? []).filter((row) => idOf(row) !== movingId);
  const at = Math.max(0, Math.min(Math.trunc(index), siblings.length));
  const before = at > 0 ? rankOf(siblings[at - 1] as T) : null;
  const after = at < siblings.length ? rankOf(siblings[at] as T) : null;
  if (
    (before === null || isRank(before)) &&
    (after === null || isRank(after)) &&
    (before === null || after === null || before < after)
  ) {
    return { rank: rankBetween(before, after) };
  }
  const ranks = rankSequence(siblings.length + 1);
  const ids = siblings.map(idOf);
  const order = [...ids.slice(0, at), movingId ?? '', ...ids.slice(at)];
  return {
    rank: ranks[at] as string,
    rerank: order
      .filter((id) => id !== '')
      .map((id) => ({ id, rank: ranks[order.indexOf(id)] as string })),
  };
}

/**
 * Moves `id` under `parentId` at `index` (counted without the node itself).
 * Rejects moving a node into itself or its own descendants.
 */
export function moveNode<T>(
  tree: TreeIndex<T>,
  id: string,
  target: { parentId: string | null; index: number }
): TreeMoveResult {
  if (!tree.byId.has(id)) return { ok: false, reason: `There is no node ${id}.` };
  if (target.parentId !== null && !tree.byId.has(target.parentId)) {
    return { ok: false, reason: `There is no node ${target.parentId}.` };
  }
  if (target.parentId !== null && isWithin(tree, id, target.parentId)) {
    return { ok: false, reason: 'A node cannot move inside itself.' };
  }
  const currentParent = parentIn(tree, id);
  const siblings = tree.children.get(currentParent) ?? [];
  const currentIndex = siblings.findIndex((row) => tree.accessors.id(row) === id);
  const others = (tree.children.get(target.parentId) ?? []).filter(
    (row) => tree.accessors.id(row) !== id
  ).length;
  const index = Math.max(0, Math.min(Math.trunc(target.index), others));
  const unchanged = currentParent === target.parentId && currentIndex === index;
  const rank = unchanged
    ? { rank: tree.accessors.rank(tree.byId.get(id) as T) }
    : rankAt(tree, target.parentId, index, id);
  return { ok: true, move: { id, parentId: target.parentId, ...rank }, unchanged };
}

function siblingIndex<T>(
  tree: TreeIndex<T>,
  id: string
): { parent: string | null; index: number; list: T[] } {
  const parent = parentIn(tree, id);
  const list = tree.children.get(parent) ?? [];
  return { parent, index: list.findIndex((row) => tree.accessors.id(row) === id), list };
}

/** Indent: becomes the last child of its previous sibling (Tab in an outline). */
export function indent<T>(tree: TreeIndex<T>, id: string): TreeMoveResult {
  const { index, list } = siblingIndex(tree, id);
  if (index <= 0) return { ok: false, reason: 'There is no item above to indent under.' };
  const newParent = tree.accessors.id(list[index - 1] as T);
  return moveNode(tree, id, { parentId: newParent, index: Number.MAX_SAFE_INTEGER });
}

/** Outdent: becomes the sibling right after its parent (Shift+Tab). */
export function outdent<T>(tree: TreeIndex<T>, id: string): TreeMoveResult {
  const parent = parentIn(tree, id);
  if (parent === null) return { ok: false, reason: 'This item is already at the top level.' };
  const { parent: grandParent, index } = siblingIndex(tree, parent);
  return moveNode(tree, id, { parentId: grandParent, index: index + 1 });
}

/** Moves one place up or down among its siblings (Alt+Arrow). */
export function moveSibling<T>(tree: TreeIndex<T>, id: string, step: -1 | 1): TreeMoveResult {
  const { parent, index, list } = siblingIndex(tree, id);
  const next = index + step;
  if (next < 0 || next >= list.length) {
    return { ok: false, reason: step < 0 ? 'Already the first item.' : 'Already the last item.' };
  }
  return moveNode(tree, id, { parentId: parent, index: next });
}

/** Parent and rank for a new node right after `afterId` (Enter in an outline), or at the end of the roots. */
export function newSibling<T>(
  tree: TreeIndex<T>,
  afterId: string | null
): { parentId: string | null; rank: string } {
  if (afterId === null || !tree.byId.has(afterId)) {
    return { parentId: null, ...rankAt(tree, null, Number.MAX_SAFE_INTEGER, null) };
  }
  const { parent, index } = siblingIndex(tree, afterId);
  return { parentId: parent, rank: rankAt(tree, parent, index + 1, null).rank };
}

/** Where `id` may move: the top level and every node outside its own subtree, depth first. */
export function validParents<T>(
  tree: TreeIndex<T>,
  id: string
): { id: string | null; level: number }[] {
  const out: { id: string | null; level: number }[] = [{ id: null, level: 0 }];
  for (const node of flatten(tree, { expanded: 'all' })) {
    if (!isWithin(tree, id, node.id)) out.push({ id: node.id, level: node.level });
  }
  return out;
}
