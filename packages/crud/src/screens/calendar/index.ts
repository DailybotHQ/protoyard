/**
 * `@protoyard/crud/screens/calendar`: the generated calendar route. A separate
 * entry so the screen, CalendarView and the calendar engine load only with it.
 */
export { default as CalendarScreen } from './CalendarScreen.svelte';
export {
  type CalendarScreenSpec,
  prefillFor,
  type RecordEvent,
  reschedulePatch,
  rowToSeries,
  toneFor,
} from './model.ts';
