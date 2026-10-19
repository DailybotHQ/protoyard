import { addDays, dayBounds, daysBetween, parseInstant, toIso } from './dates.ts';
import {
  type CalendarSeries,
  type ExpandOptions,
  hasOccurrence,
  type OccurrenceOverride,
  occurrenceIndex,
} from './recurrence.ts';

/** Which occurrences an edit of one occurrence applies to. */
export type EditScope = 'this' | 'following' | 'all';

/** The new start/end (same format as the series) and/or data of an occurrence, or a delete. */
export interface OccurrenceChange<TData = unknown> {
  start?: string;
  end?: string;
  data?: TData;
  delete?: boolean;
}

/** Rows to write in one transaction: series to put (new or replaced) and ids to delete. */
export interface SeriesWrites<TData = unknown> {
  put: CalendarSeries<TData>[];
  delete: string[];
}

export interface SplitOptions extends ExpandOptions {
  /** Id for the series a 'following' edit creates (pass `ctx.ids` or the service's id maker). */
  newId: () => string;
}

/** Moves a start or end by `delta` (ms for timed series, days for all-day). */
function shift(value: string, delta: number, allDay: boolean): string {
  return allDay ? addDays(value, delta) : toIso(parseInstant(value) + delta);
}

function distance(from: string, to: string, allDay: boolean): number {
  return allDay ? daysBetween(from, to) : parseInstant(to) - parseInstant(from);
}

/** Re-keys EXDATE and overrides after the series moved by `delta`. */
function shiftExceptions<TData>(
  series: CalendarSeries<TData>,
  delta: number,
  keep: (id: string) => boolean
): Pick<CalendarSeries<TData>, 'exdates' | 'overrides'> {
  const allDay = series.allDay === true;
  const exdates = (series.exdates ?? []).filter(keep).map((id) => shift(id, delta, allDay));
  const overrides: Record<string, OccurrenceOverride<TData>> = {};
  for (const [id, override] of Object.entries(series.overrides ?? {})) {
    if (keep(id)) overrides[shift(id, delta, allDay)] = override;
  }
  return {
    ...(exdates.length > 0 ? { exdates } : {}),
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
}

function withoutExceptions<TData>(series: CalendarSeries<TData>): CalendarSeries<TData> {
  const { exdates: _exdates, overrides: _overrides, ...rest } = series;
  return rest;
}

/**
 * Applies an edit of one occurrence to `scope` and returns the rows to write.
 * `this` stores an override (or an EXDATE for a delete); `all` moves the whole
 * series by the occurrence's change; `following` ends the series before the
 * occurrence and starts a new one there (on the first occurrence it is `all`).
 * Throws a `RangeError` when `occurrenceId` is not an occurrence of `series`.
 */
export function splitSeries<TData>(
  series: CalendarSeries<TData>,
  occurrenceId: string,
  scope: EditScope,
  change: OccurrenceChange<TData>,
  options: SplitOptions
): SeriesWrites<TData> {
  const allDay = series.allDay === true;
  if (!series.rule) {
    if (change.delete) return { put: [], delete: [series.id] };
    return { put: [applyToMaster(series, series.start, change)], delete: [] };
  }
  if (!hasOccurrence(series, occurrenceId, options)) {
    throw new RangeError(`${occurrenceId} is not an occurrence of ${series.id}`);
  }
  const earlier = occurrenceIndex(series, occurrenceId, options);
  if (scope === 'following' && earlier === 0) scope = 'all';

  if (scope === 'this') {
    const { [occurrenceId]: _old, ...overrides } = series.overrides ?? {};
    if (change.delete) {
      const exdates = [...new Set([...(series.exdates ?? []), occurrenceId])].sort();
      return { put: [{ ...series, exdates, overrides }], delete: [] };
    }
    const previous = series.overrides?.[occurrenceId] ?? {};
    const next: OccurrenceOverride<TData> = { ...previous };
    if (change.start !== undefined) next.start = change.start;
    if (change.end !== undefined) next.end = change.end;
    if (change.data !== undefined) next.data = change.data;
    return { put: [{ ...series, overrides: { ...overrides, [occurrenceId]: next } }], delete: [] };
  }

  if (scope === 'all') {
    if (change.delete) return { put: [], delete: [series.id] };
    const moved = applyToMaster(series, occurrenceId, change);
    const delta = distance(series.start, moved.start, allDay);
    const rule = { ...series.rule };
    if (rule.until && !allDay) rule.until = toIso(parseInstant(rule.until) + delta);
    return { put: [{ ...moved, rule, ...shiftExceptions(series, delta, () => true) }], delete: [] };
  }

  // 'following': the head keeps the occurrences before this one.
  const zone = series.timeZone ?? options.timeZone ?? 'UTC';
  const cut = allDay ? dayBounds(occurrenceId, zone).start : parseInstant(occurrenceId);
  const before = (id: string) => (allDay ? id < occurrenceId : parseInstant(id) < cut);
  const head: CalendarSeries<TData> = {
    ...withoutExceptions(series),
    ...shiftExceptions(series, 0, before),
  };
  const headRule = { ...series.rule };
  // COUNT and UNTIL never appear together (RFC 5545); UNTIL is inclusive.
  if (headRule.count !== undefined) headRule.count = earlier;
  else headRule.until = toIso(cut - 1000);
  head.rule = headRule;
  if (change.delete) return { put: [head], delete: [] };

  const tailBase: CalendarSeries<TData> = {
    ...withoutExceptions(series),
    id: options.newId(),
    start: occurrenceId,
    end: shift(occurrenceId, distance(series.start, series.end, allDay), allDay),
  };
  const tail = applyToMaster(tailBase, occurrenceId, change);
  const delta = distance(occurrenceId, tail.start, allDay);
  const tailRule = { ...series.rule };
  if (tailRule.count !== undefined) tailRule.count = Math.max(1, tailRule.count - earlier);
  if (tailRule.until && !allDay) tailRule.until = toIso(parseInstant(tailRule.until) + delta);
  tail.rule = tailRule;
  Object.assign(
    tail,
    shiftExceptions(series, delta, (id) => !before(id) && id !== occurrenceId)
  );
  return { put: [head, tail], delete: [] };
}

/** The series moved and resized the way `change` moves the occurrence at `occurrenceId`. */
function applyToMaster<TData>(
  series: CalendarSeries<TData>,
  occurrenceId: string,
  change: OccurrenceChange<TData>
): CalendarSeries<TData> {
  const allDay = series.allDay === true;
  const length = distance(series.start, series.end, allDay);
  const start = change.start ?? occurrenceId;
  const delta = distance(occurrenceId, start, allDay);
  const newStart = shift(series.start, delta, allDay);
  const newLength = change.end !== undefined ? distance(start, change.end, allDay) : length;
  if (newLength <= 0) throw new RangeError('an occurrence must end after it starts');
  const next: CalendarSeries<TData> = {
    ...series,
    start: newStart,
    end: shift(newStart, newLength, allDay),
  };
  if (change.data !== undefined) next.data = change.data;
  return next;
}
