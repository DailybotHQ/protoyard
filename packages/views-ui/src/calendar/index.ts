/**
 * `@protoyard/views-ui/calendar` — the calendar view: month, week, day and
 * agenda over `@protoyard/views/calendar` series (with recurrence), keyboard
 * and pointer moves, click-to-create and a recurrence scope dialog. Import
 * this subpath only from a lazy route screen.
 */
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
