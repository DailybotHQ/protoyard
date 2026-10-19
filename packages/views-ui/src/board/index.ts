/**
 * `@protoyard/views-ui/board` — `BoardView`, the rich kanban: columns ×
 * swimlanes, ranks, WIP limits, pointer and keyboard drag, a "Move to…" menu
 * and optimistic moves that roll back. Built on `@protoyard/views/board`. The
 * simple `Kanban` in `@protoyard/ui` stays as it is.
 */
export { default as BoardView } from './BoardView.svelte';
export {
  AUTO_SCROLL_EDGE_PX,
  autoScrollDelta,
  DRAG_THRESHOLD_PX,
  indexFromPointer,
  type Placement,
  placementsOf,
  settled,
  withOverrides,
} from './model.ts';
