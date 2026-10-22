import {
  pruneSelection,
  type SelectionState,
  selectionState,
  selectRange,
  setVisibleSelected,
  toggleRow,
} from '@protoyard/views/grid';

/**
 * DataGrid's row selection, loaded only for grids with bulk actions: the
 * checkbox component and the selection rules from `@protoyard/views/grid`.
 */
export { default as SelectBox } from './SelectBox.svelte';

export interface SelectionStep {
  selection: string[];
  anchor: string | null;
  /** What happened, for the grid's live region. */
  message: string;
}

/** Toggles one row, or (with `range`) selects from the anchor to it. */
export function selectRow(
  selection: readonly string[],
  order: readonly string[],
  anchor: string | null,
  id: string,
  range: boolean
): SelectionStep {
  const next = range ? selectRange(selection, order, anchor, id) : toggleRow(selection, id, order);
  const verb = next.includes(id) ? 'Selected' : 'Deselected';
  return {
    selection: next,
    anchor: range ? anchor : id,
    message: `${verb} a row. ${next.length} selected.`,
  };
}

/** Selects every shown row, or clears them when all are already selected. */
export function toggleVisible(
  selection: readonly string[],
  visible: readonly string[]
): { selection: string[]; message: string } {
  const all = selectionState(selection, visible) === 'all';
  return {
    selection: setVisibleSelected(selection, visible, !all),
    message: all ? 'Cleared the shown rows.' : `Selected ${visible.length} rows.`,
  };
}

export function stateOf(selection: readonly string[], visible: readonly string[]): SelectionState {
  return selectionState(selection, visible);
}

export { pruneSelection };
