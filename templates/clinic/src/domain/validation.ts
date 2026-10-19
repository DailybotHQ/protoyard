import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';

/**
 * Input schemas for every service. Field errors come from core
 * `ValidationError.issues` (path → first message) so dialogs can render them
 * inline; `runService` leaves these errors to the form instead of toasting them.
 *
 * The contact rules only accept obviously fictional values (`@example.com`,
 * `+1 555-01xx`), so nobody types a real patient's details into a demo.
 */

export { parseInput, ValidationError };
export const parse = parseInput;

/** Appointments snap to this grid (the calendar's 15-minute slots). */
export const STEP_MINUTES = 15;
export const MAX_APPOINTMENT_MINUTES = 2 * 60;
export const NOTE_MAX_LENGTH = 4000;

const instant = z.iso.datetime({ offset: true, message: 'Pick a date and time' });
const onGrid = (iso: string) => Date.parse(iso) % (STEP_MINUTES * 60_000) === 0;

const span = z
  .object({ start: instant, end: instant })
  .refine((s) => onGrid(s.start) && onGrid(s.end), {
    message: `Times snap to ${STEP_MINUTES}-minute steps`,
    path: ['start'],
  })
  .refine((s) => Date.parse(s.end) > Date.parse(s.start), {
    message: 'The end must be after the start',
    path: ['end'],
  })
  .refine((s) => Date.parse(s.end) - Date.parse(s.start) <= MAX_APPOINTMENT_MINUTES * 60_000, {
    message: `An appointment lasts at most ${MAX_APPOINTMENT_MINUTES / 60} hours`,
    path: ['end'],
  });

export const AppointmentInputSchema = z
  .object({
    patientId: z.string().min(1, 'Pick a patient'),
    providerId: z.string().min(1, 'Pick a provider'),
    reason: z.string().trim().min(2, 'Enter a reason for the visit').max(80),
  })
  .and(span);
export type AppointmentInput = z.input<typeof AppointmentInputSchema>;

export const CancelInputSchema = z.object({
  reason: z.string().trim().max(200, 'Keep it under 200 characters').default(''),
});
export type CancelInput = z.input<typeof CancelInputSchema>;

const name = (label: string) =>
  z.string().trim().min(1, `Enter a ${label}`).max(60, 'Keep it under 60 characters');

export const PatientInputSchema = z.object({
  firstName: name('first name'),
  lastName: name('last name'),
  dateOfBirth: z.iso
    .date('Enter a date of birth')
    .refine((d) => d >= '1900-01-01', 'Enter a date after 1900'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .refine((e) => e.endsWith('@example.com'), 'Fictional data only: use an @example.com address'),
  phone: z
    .string()
    .trim()
    .regex(/^\+1 555-01\d\d$/, 'Fictional data only: use a +1 555-01xx number'),
  allergies: z.string().trim().max(200, 'Keep it under 200 characters').default(''),
  insuranceId: z
    .string()
    .trim()
    .regex(/^(SIM-\d{6})?$/, 'Fictional data only: use SIM- and six digits, or leave it empty')
    .default(''),
});
export type PatientInput = z.input<typeof PatientInputSchema>;

/** A plain-text visit note; markup is kept as typed and never rendered as HTML. */
export const NoteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write the note before saving')
    .max(NOTE_MAX_LENGTH, `Keep the note under ${NOTE_MAX_LENGTH} characters`),
});
export type NoteInput = z.input<typeof NoteInputSchema>;
