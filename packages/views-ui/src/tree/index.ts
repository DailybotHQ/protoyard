/**
 * `@protoyard/views-ui/tree` — host `TreeView` / `OutlineEditor` on the
 * `@protoyard/views/tree` engine (Texuli), plus a re-export of Texuli's
 * `TreeDataView` for the items-array API.
 */

export { TreeDataView, type TreeDataViewLabels } from '@texuli/data/tree-view';
export {
  type DropZone,
  dropMove,
  dropZone,
  settledOverrides,
  TREE_DRAG_THRESHOLD_PX,
  type TreePlacement,
  treeAccessors,
  treePlacements,
} from './model.ts';
export { default as OutlineEditor } from './OutlineEditor.svelte';
export { default as TreeView } from './TreeView.svelte';
