/**
 * `@protoyard/views-ui/timeline` — thin host adapter over `@texuli/data/timeline`.
 */

export {
  DAY_WIDTH,
  dateAtOffset,
  dateOffset,
  durationLabel,
  progressValue,
  ROW_HEIGHT,
  TimelineView as TexuliTimelineView,
  type TimelineZoom,
  timelineRange,
  ZOOMS,
} from '@texuli/data/timeline';
export { default as TimelineView } from './TimelineView.svelte';
