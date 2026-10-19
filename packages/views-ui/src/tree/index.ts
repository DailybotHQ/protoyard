/**
 * `@protoyard/views-ui/tree` — `TreeView` (an ARIA tree with typeahead, lazy
 * children, virtualization, drag-to-reparent and "Move to…") and
 * `OutlineEditor` (inline titles with Enter, Tab / Shift+Tab and Alt+arrows),
 * on the `@protoyard/views/tree` engine.
 */
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
