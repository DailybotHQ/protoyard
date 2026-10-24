/**
 * `@protoyard/views-ui/tree` — thin TreeView adapter over Texuli TreeDataView;
 * OutlineEditor remains a Protoyard host surface (no Texuli outline editor).
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
