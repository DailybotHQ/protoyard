import type { BlueprintEntity, BlueprintField, BlueprintScreen } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import { addDays, type CalendarSeries, dateIn, parseInstant } from '@protoyard/views/calendar';
import type { CalendarTone } from '@protoyard/views-ui/calendar';

/**
 * Rows ↔ calendar series for a blueprint `calendar` screen. A `date` field
 * draws all-day events (its `endField` is the last day, inclusive); a
 * `datetime` field draws timed events (without an end: one hour).
 */

export type CalendarScreenSpec = Extract<BlueprintScreen, { type: 'calendar' }>;

export interface RecordEvent {
  title: string;
  row: Row;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 3_600_000;

/** Colors follow the enum's declared order, so a value keeps its color everywhere. */
const TONES: readonly CalendarTone[] = [
  'primary',
  'info',
  'success',
  'warning',
  'danger',
  'neutral',
];

export function toneFor(field: BlueprintField | undefined, value: unknown): CalendarTone {
  if (field?.kind !== 'enum') return 'primary';
  const index = field.values.indexOf(String(value));
  return index < 0 ? 'neutral' : (TONES[index % TONES.length] as CalendarTone);
}

/** A stored date (`YYYY-MM-DD`, or an ISO instant from generated data) as a civil date in `timeZone`. */
function civilDate(value: unknown, timeZone: string): string | null {
  if (typeof value !== 'string' || value === '') return null;
  if (DATE_ONLY.test(value)) return value;
  try {
    return dateIn(parseInstant(value), timeZone);
  } catch {
    return null;
  }
}

function instant(value: unknown): number | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    return parseInstant(value);
  } catch {
    const date = DATE_ONLY.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
    return Number.isNaN(date) ? null : date;
  }
}

/** The calendar series for one row, or null when its date is empty or invalid. */
export function rowToSeries(
  row: Row,
  entity: BlueprintEntity,
  screen: CalendarScreenSpec,
  timeZone: string
): CalendarSeries<RecordEvent> | null {
  const dateField = entity.fields.find((f) => f.name === screen.dateField);
  if (!dateField) return null;
  const title = String(row[entity.titleField] ?? '').trim() || 'Untitled';
  const data = { title, row };
  const rawEnd = screen.endField ? row[screen.endField] : undefined;

  if (dateField.kind === 'date') {
    const start = civilDate(row[screen.dateField], timeZone);
    if (!start) return null;
    const last = civilDate(rawEnd, timeZone);
    const end = last && last >= start ? addDays(last, 1) : addDays(start, 1);
    return { id: String(row.id), start, end, allDay: true, data };
  }
  const start = instant(row[screen.dateField]);
  if (start === null) return null;
  const endAt = instant(rawEnd);
  const end = endAt !== null && endAt > start ? endAt : start + HOUR_MS;
  return {
    id: String(row.id),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    data,
  };
}

/** The update to send when an event moved to `start` / `end` (series format). */
export function reschedulePatch(
  entity: BlueprintEntity,
  screen: CalendarScreenSpec,
  change: { start: string; end: string }
): Record<string, string> {
  const dateField = entity.fields.find((f) => f.name === screen.dateField);
  const patch: Record<string, string> = { [screen.dateField]: change.start };
  if (screen.endField) {
    patch[screen.endField] = dateField?.kind === 'date' ? addDays(change.end, -1) : change.end;
  }
  return patch;
}

/** Initial values for a new record created from a calendar slot. */
export function prefillFor(
  entity: BlueprintEntity,
  screen: CalendarScreenSpec,
  slot: { date: string; start: string; end: string; allDay: boolean }
): Row {
  const dateField = entity.fields.find((f) => f.name === screen.dateField);
  const asDate = dateField?.kind === 'date';
  const row: Record<string, unknown> = {
    [screen.dateField]: asDate
      ? slot.date
      : slot.allDay
        ? `${slot.date}T09:00:00.000Z`
        : slot.start,
  };
  if (screen.endField) {
    row[screen.endField] = asDate
      ? slot.date
      : slot.allDay
        ? `${slot.date}T10:00:00.000Z`
        : slot.end;
  }
  return row as Row;
}
