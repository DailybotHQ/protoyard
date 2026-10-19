/**
 * `@protoyard/views/calendar` — framework-free calendar math with no date
 * library: civil dates and wall-clock time in an explicit IANA zone, month,
 * week, day and agenda ranges, an RFC 5545 recurrence subset, edit splitting
 * ("this / following / all") and overlap layout for time grids.
 * Nothing reads `Date.now()` or the system zone: pass `today`/`now` from the
 * runtime clock and the zone of the persona or prototype.
 * `@protoyard/views-ui/calendar` renders it.
 */
export {
  addDays,
  dateIn,
  dayBounds,
  daysBetween,
  daysInMonth,
  formatIsoDate,
  type IsoDate,
  parseInstant,
  parseIsoDate,
  toIso,
  type WallTime,
  wallTime,
  weekdayOf,
  zonedInstant,
} from './dates.ts';
export {
  type CalendarView,
  type MonthCell,
  monthGrid,
  startOfWeek,
  stepAnchor,
  type VisibleRange,
  visibleRange,
  type Weekday,
  weekDates,
  weekStartFor,
} from './grid.ts';
export { type DayLayoutItem, type DayLayoutOptions, layoutDay, type TimedEvent } from './layout.ts';
export {
  type CalendarSeries,
  type ExpandOptions,
  type Expansion,
  expandAll,
  expandSeries,
  formatRRule,
  hasOccurrence,
  MAX_OCCURRENCES,
  type Occurrence,
  type OccurrenceOverride,
  occurrenceIndex,
  parseRRule,
  type RecurrenceRule,
  RecurrenceRuleSchema,
  type WeekdayCode,
} from './recurrence.ts';
export {
  type EditScope,
  type OccurrenceChange,
  type SeriesWrites,
  type SplitOptions,
  splitSeries,
} from './split.ts';
