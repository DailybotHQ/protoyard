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

/** What `onChange` receives: the edit and the series rows to write in one transaction. */
export interface CalendarChange<TData = unknown> {
  occurrence: Occurrence<TData>;
  scope: EditScope;
  /** New start and end, in the series' format (instants, or dates when all-day). */
  start: string;
  end: string;
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
