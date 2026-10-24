import type { EditScope, IsoDate, Occurrence, SeriesWrites } from '@protoyard/views/calendar';

export type CalendarTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

/** An occurrence as drawn: where it is now (optimistic or grabbed), its title and state. */
export interface CalendarItem<TData = unknown> extends Occurrence<TData> {
  /** Same as `key`; lets `layoutDay` place the item. */
  id: string;
  key: string;
  title: string;
  tone: CalendarTone;
  /** A save is in flight. */
  pending: boolean;
  /** Grabbed with Space or a pointer: arrows or the pointer move it until Enter / release. */
  grabbed: boolean;
}

/**
 * Reschedule payload from Texuli CalendarView (`@texuli/data/calendar/view`),
 * plus host-only `writes` / `scope` for series split services (keel, ui-kit).
 * The adapter always fills `writes` when it can resolve the series.
 */
export interface CalendarChange<TData = unknown> {
  /** The series id: the record to update. */
  id: string;
  /** The occurrence's original start; tells repeating occurrences apart. */
  occurrenceId: string;
  /** New start and end, in the series' format (instants, or dates when all-day). */
  start: string;
  end: string;
  allDay: boolean;
  recurring: boolean;
  /** The occurrence as it was before the move. */
  occurrence: Occurrence<TData>;
  /** Edit scope used when building series writes (`this` for recurring, `all` otherwise). */
  scope: EditScope;
  /** Series rows to put/delete in one transaction (always set by the adapter). */
  writes: SeriesWrites<TData>;
}

/** What `onCreate` receives: an empty slot (timed) or a day (all-day, `end` exclusive). */
export interface CalendarSlot {
  date: IsoDate;
  start: string;
  end: string;
  allDay: boolean;
}

export const TONE_CLASSES: Record<CalendarTone, string> = {
  neutral: 'bg-muted border-l-border',
  primary: 'bg-primary/10 border-l-primary',
  info: 'bg-info/10 border-l-info',
  success: 'bg-success/10 border-l-success',
  warning: 'bg-warning/10 border-l-warning',
  danger: 'bg-destructive/10 border-l-destructive',
};
