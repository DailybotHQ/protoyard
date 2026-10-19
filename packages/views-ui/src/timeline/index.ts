/**
 * `@protoyard/views-ui/timeline` — a virtualized Gantt timeline with dependency
 * arrows, a runtime-clock today line, progress, critical path, and keyboard or
 * pointer rescheduling. Import from a lazy route screen.
 */

export {
  DAY_WIDTH,
  dateAtOffset,
  dateOffset,
  durationLabel,
  progressValue,
  ROW_HEIGHT,
  type TimelineZoom,
  timelineRange,
  ZOOMS,
} from './model.ts';
export { default as TimelineView } from './TimelineView.svelte';
