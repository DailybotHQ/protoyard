/**
 * Row selection for bulk actions, as plain data: the selected row ids in the
 * order the rows are shown. Pure helpers return new arrays; the grid (or the
 * app) owns the value, and a selection survives filtering until the rows
 * themselves go (`pruneSelection`).
 */

export type RowSelection = readonly string[];

/** `none`, `some` or `all` of the visible rows are selected (drives a tri-state checkbox). */
export type SelectionState = 'none' | 'some' | 'all';

/** Selection ids in row order; ids that are not in `order` keep their place at the end. */
function ordered(ids: Iterable<string>, order: readonly string[]): string[] {
  const wanted = new Set(ids);
  const result = order.filter((id) => wanted.delete(id));
  return [...result, ...wanted];
}

/** Adds or removes one row. */
export function toggleRow(
  selection: RowSelection,
  id: string,
  order: readonly string[] = []
): string[] {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return ordered(next, order);
}

/**
 * Shift-click: selects every row from `anchor` to `id` in `order` (both
 * included), keeping what was already selected. Without a usable anchor it
 * toggles `id` alone.
 */
export function selectRange(
  selection: RowSelection,
  order: readonly string[],
  anchor: string | null,
  id: string
): string[] {
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) return toggleRow(selection, id, order);
  const [low, high] = from <= to ? [from, to] : [to, from];
  return ordered([...selection, ...order.slice(low, high + 1)], order);
}

/** Selects (or clears) every visible row; rows selected elsewhere stay as they are. */
export function setVisibleSelected(
  selection: RowSelection,
  visible: readonly string[],
  selected: boolean
): string[] {
  if (selected) return ordered([...selection, ...visible], visible);
  const hidden = new Set(visible);
  return selection.filter((id) => !hidden.has(id));
}

export function selectionState(
  selection: RowSelection,
  visible: readonly string[]
): SelectionState {
  if (visible.length === 0) return 'none';
  const chosen = new Set(selection);
  const count = visible.reduce((total, id) => total + (chosen.has(id) ? 1 : 0), 0);
  return count === 0 ? 'none' : count === visible.length ? 'all' : 'some';
}

/** Drops ids whose rows no longer exist (deleted, or a new data set). */
export function pruneSelection(selection: RowSelection, existing: Iterable<string>): string[] {
  const keep = new Set(existing);
  return selection.filter((id) => keep.has(id));
}
