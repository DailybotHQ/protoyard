/**
 * `@protoyard/views-ui/calendar` — thin host adapter over `@texuli/data/calendar/view`.
 * Host types for service write contracts stay local.
 */

export {
  type CalendarLabels,
  type CalendarMode,
  CalendarView as TexuliCalendarView,
  DEFAULT_CALENDAR_LABELS,
} from '@texuli/data/calendar/view';
export { default as CalendarView } from './CalendarView.svelte';
export type { CalendarChange, CalendarItem, CalendarSlot, CalendarTone } from './types.ts';
