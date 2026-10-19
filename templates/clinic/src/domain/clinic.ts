import { createRng } from '@protoyard/core';
import {
  type Appointment,
  type AppointmentStatus,
  type AuditChange,
  type AvailabilityRule,
  type Patient,
  SENSITIVE_PATIENT_FIELDS,
} from '../database/schema.ts';

/**
 * Pure clinic rules, shared by the services (which enforce them inside the
 * write transaction), the screens and the generator. Times are UTC instants.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

/** What an audit entry stores instead of a sensitive value. */
export const REDACTED = '[redacted]';

/** Check-in opens this long before the start and closes when the appointment ends. */
export const CHECK_IN_OPENS_MINUTES = 60;

/** Half-open spans `[start, end)` overlap when each starts before the other ends. */
export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Scheduled and checked-in appointments hold time; the rest free it. */
export const holdsTime = (a: Pick<Appointment, 'status'>) =>
  a.status === 'scheduled' || a.status === 'checked-in';

/** The first appointment holding time that overlaps the span and matches `same` (ignoring `exceptId`). */
export function findConflict(
  appointments: readonly Appointment[],
  span: { start: string; end: string },
  same: (a: Appointment) => boolean,
  exceptId?: string
): Appointment | undefined {
  return appointments.find(
    (a) => a.id !== exceptId && same(a) && holdsTime(a) && overlaps(a, span)
  );
}

/** True when the span fits inside one clinic-hours rule of its provider on its UTC day. */
export function withinHours(
  rules: readonly AvailabilityRule[],
  span: { providerId: string; start: string; end: string }
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
      r.providerId === span.providerId &&
      r.weekday === weekday &&
      from >= r.startMinute &&
      to <= r.endMinute
  );
}

/** Free start times for one provider on one UTC day (inside hours, after `now`, not overlapping). */
export function freeSlots(options: {
  rules: readonly AvailabilityRule[];
  appointments: readonly Appointment[];
  providerId: string;
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  durationMinutes: number;
  now: Date;
  stepMinutes?: number;
}): { start: string; end: string }[] {
  const step = options.stepMinutes ?? 15;
  const dayStart = Date.parse(`${options.day}T00:00:00.000Z`);
  const weekday = new Date(dayStart).getUTCDay();
  const out: { start: string; end: string }[] = [];
  const mine = (a: Appointment) => a.providerId === options.providerId;
  for (const rule of options.rules) {
    if (rule.providerId !== options.providerId || rule.weekday !== weekday) continue;
    for (let m = rule.startMinute; m + options.durationMinutes <= rule.endMinute; m += step) {
      const start = new Date(dayStart + m * MINUTE).toISOString();
      const end = new Date(dayStart + (m + options.durationMinutes) * MINUTE).toISOString();
      if (Date.parse(start) <= options.now.getTime()) continue;
      if (findConflict(options.appointments, { start, end }, mine)) continue;
      out.push({ start, end });
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Why an appointment cannot be checked in right now, or null when it can. */
export function checkInBlocker(
  a: Pick<Appointment, 'status' | 'start' | 'end'>,
  now: Date
): string | null {
  if (a.status === 'checked-in') return 'Already checked in';
  if (a.status !== 'scheduled') return 'Only scheduled appointments can be checked in';
  const t = now.getTime();
  if (t < Date.parse(a.start) - CHECK_IN_OPENS_MINUTES * MINUTE) {
    return `Check-in opens ${CHECK_IN_OPENS_MINUTES} minutes before the appointment`;
  }
  if (t >= Date.parse(a.end)) return 'This appointment has already ended';
  return null;
}

/** Minutes a checked-in patient has waited past their start (0 when early or not checked in). */
export function waitMinutes(a: Pick<Appointment, 'status' | 'start'>, now: Date): number {
  if (a.status !== 'checked-in') return 0;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(a.start)) / MINUTE));
}

/** Whole years between a `YYYY-MM-DD` birth date and `now` (UTC). */
export function ageOn(dateOfBirth: string, now: Date): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

const SENSITIVE = new Set<string>(SENSITIVE_PATIENT_FIELDS);
export const isSensitive = (field: string) => SENSITIVE.has(field);

/** A masked display value: the length is hidden too, so a mask leaks nothing. */
export const mask = (value: string) => (value ? '••••••' : '—');

/**
 * The changed fields between two patient records, for the audit log. Every
 * sensitive field is recorded as changed but with `REDACTED` on both sides.
 */
export function patientChanges(
  before: Partial<Patient> | null,
  after: Partial<Patient>,
  fields: readonly (keyof Patient)[]
): AuditChange[] {
  const out: AuditChange[] = [];
  for (const field of fields) {
    const from = before ? String(before[field] ?? '') : null;
    const to = String(after[field] ?? '');
    if (from === to) continue;
    out.push(
      isSensitive(field)
        ? { field, from: before ? REDACTED : null, to: REDACTED }
        : { field, from: from || null, to: to || null }
    );
  }
  return out;
}

/**
 * What became of an appointment once it ended without anyone acting on it:
 * about one in ten is a no-show, the rest arrived and were seen. Depends only
 * on the scenario seed and the appointment id, so the generator and the
 * timeline agree, whatever window time advances by.
 */
export function outcomeFor(seed: number, appointmentId: string): 'completed' | 'no-show' {
  return createRng(`clinic:outcome:${seed}:${appointmentId}`).chance(0.1) ? 'no-show' : 'completed';
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Checked in',
  completed: 'Completed',
  'no-show': 'No-show',
  cancelled: 'Cancelled',
};

export const patientName = (p: Pick<Patient, 'firstName' | 'lastName'> | undefined) =>
  p ? `${p.firstName} ${p.lastName}` : 'Unknown patient';
