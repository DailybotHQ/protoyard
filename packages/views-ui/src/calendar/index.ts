/**
 * `@protoyard/views-ui/calendar` — the calendar view: month, week, day and
 * agenda over `@protoyard/views/calendar` series (with recurrence), keyboard
 * and pointer moves, click-to-create and a recurrence scope dialog. Import
 * this subpath only from a lazy route screen.
 */

/** Texuli calendar (events array API). Prefer CalendarView host adapter for liveQuery and edits. */
export {
  type CalendarLabels,
  CalendarView as TexuliCalendarView,
  DEFAULT_CALENDAR_LABELS,
} from '@texuli/data/calendar/view';
export { default as CalendarView } from './CalendarView.svelte';
export {
  applyMove,
  type CalendarMode,
  HOUR_PX,
  type Move,
  occurrenceKey,
  SLOT_MINUTES,
  slotInstant,
} from './model.ts';
export type { CalendarChange, CalendarItem, CalendarSlot, CalendarTone } from './types.ts';
