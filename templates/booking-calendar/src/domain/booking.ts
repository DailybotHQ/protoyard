import { createRng } from '@protoyard/core';
import type { AvailabilityRule, Booking } from '../database/schema.ts';

/**
 * Pure booking rules, shared by the services (which enforce them inside the
 * write transaction), the public booking page (which only offers free slots)
 * and the generator. Times are UTC instants.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Half-open spans `[start, end)` overlap when each starts before the other ends. */
export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Only confirmed bookings hold time; cancelled, completed and no-show ones do not block new bookings. */
export const holdsTime = (b: Pick<Booking, 'status'>) => b.status === 'confirmed';

/** The first confirmed booking of the same resource that overlaps the span (ignoring `exceptId`). */
export function findConflict(
  bookings: readonly Booking[],
  span: { resourceId: string; start: string; end: string },
  exceptId?: string
): Booking | undefined {
  return bookings.find(
    (b) =>
      b.resourceId === span.resourceId && b.id !== exceptId && holdsTime(b) && overlaps(b, span)
  );
}

/** True when the span fits inside one opening-hours rule of its resource on its UTC day. */
export function withinAvailability(
  rules: readonly AvailabilityRule[],
  span: { resourceId: string; start: string; end: string }
): boolean {
  const start = Date.parse(span.start);
  const end = Date.parse(span.end);
  const dayStart = Math.floor(start / DAY) * DAY;
  if (end > dayStart + DAY) return false;
  const weekday = new Date(dayStart).getUTCDay();
  const from = (start - dayStart) / MINUTE;
  const to = (end - dayStart) / MINUTE;
  return rules.some(
    (r) =>
      r.resourceId === span.resourceId &&
      r.weekday === weekday &&
      from >= r.startMinute &&
      to <= r.endMinute
  );
}

/**
 * Free start times for a booking of `durationMinutes` on one UTC day: inside
 * the resource's opening hours, on a `stepMinutes` grid, after `now`, and not
 * overlapping any confirmed booking. This is all the public page offers.
 */
export function freeSlots(options: {
  rules: readonly AvailabilityRule[];
  bookings: readonly Booking[];
  resourceId: string;
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  durationMinutes: number;
  now: Date;
  stepMinutes?: number;
}): { start: string; end: string }[] {
  const step = options.stepMinutes ?? 30;
  const dayStart = Date.parse(`${options.day}T00:00:00.000Z`);
  const weekday = new Date(dayStart).getUTCDay();
  const out: { start: string; end: string }[] = [];
  for (const rule of options.rules) {
    if (rule.resourceId !== options.resourceId || rule.weekday !== weekday) continue;
    for (let m = rule.startMinute; m + options.durationMinutes <= rule.endMinute; m += step) {
      const start = new Date(dayStart + m * MINUTE).toISOString();
      const end = new Date(dayStart + (m + options.durationMinutes) * MINUTE).toISOString();
      if (Date.parse(start) <= options.now.getTime()) continue;
      if (findConflict(options.bookings, { resourceId: options.resourceId, start, end })) continue;
      out.push({ start, end });
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/**
 * What became of a booking once it ended: about one in eight is a no-show.
 * Depends only on the scenario seed and the booking id, so the generator and
 * the timeline agree, whatever window time advances by.
 */
export function outcomeFor(seed: number, bookingId: string): 'completed' | 'no-show' {
  return createRng(`booking:outcome:${seed}:${bookingId}`).chance(0.12) ? 'no-show' : 'completed';
}

export const STATUS_LABELS: Record<Booking['status'], string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  'no-show': 'No-show',
};
