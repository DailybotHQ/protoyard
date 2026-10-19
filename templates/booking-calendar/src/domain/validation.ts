import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';

/**
 * Input schemas for every service. Field errors come from core
 * `ValidationError.issues` (path → first message) so dialogs can render them
 * inline; `runService` leaves these errors to the form instead of toasting them.
 */

export { parseInput, ValidationError };
export const parse = parseInput;

/** Bookings snap to this grid (the calendar's 15-minute slots). */
export const BOOKING_STEP_MINUTES = 15;
export const MIN_BOOKING_MINUTES = 15;
export const MAX_BOOKING_MINUTES = 4 * 60;

const instant = z.iso.datetime({ offset: true, message: 'Pick a date and time' });
const onGrid = (iso: string) => Date.parse(iso) % (BOOKING_STEP_MINUTES * 60_000) === 0;

/** A time span on the grid, 15 minutes to 4 hours long, end after start. */
const span = z
  .object({ start: instant, end: instant })
  .refine((s) => onGrid(s.start) && onGrid(s.end), {
    message: `Times snap to ${BOOKING_STEP_MINUTES}-minute steps`,
    path: ['start'],
  })
  .refine((s) => Date.parse(s.end) > Date.parse(s.start), {
    message: 'The end must be after the start',
    path: ['end'],
  })
  .refine((s) => Date.parse(s.end) - Date.parse(s.start) <= MAX_BOOKING_MINUTES * 60_000, {
    message: `A booking lasts at most ${MAX_BOOKING_MINUTES / 60} hours`,
    path: ['end'],
  });

const person = {
  customerName: z.string().trim().min(2, 'Enter a name').max(80),
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .refine((e) => e.endsWith('@example.com'), 'Prototype data only: use an @example.com address'),
};

export const BookingInputSchema = z
  .object({
    resourceId: z.string().min(1, 'Pick a resource'),
    title: z.string().trim().min(2, 'Name the booking').max(80),
    ...person,
  })
  .and(span);
export type BookingInput = z.input<typeof BookingInputSchema>;

export const PublicBookingInputSchema = z
  .object({ resourceId: z.string().min(1, 'Pick a resource'), ...person })
  .and(span);
export type PublicBookingInput = z.input<typeof PublicBookingInputSchema>;

export const RescheduleInputSchema = span;
export type RescheduleInput = z.input<typeof RescheduleInputSchema>;

export const CancelInputSchema = z.object({
  reason: z.string().trim().max(200, 'Keep it under 200 characters').default(''),
});
export type CancelInput = z.input<typeof CancelInputSchema>;

export const AvailabilityInputSchema = z
  .object({
    startMinute: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    endMinute: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60),
  })
  .refine((h) => h.endMinute > h.startMinute, {
    message: 'Closing must be after opening',
    path: ['endMinute'],
  })
  .refine(
    (h) => h.startMinute % BOOKING_STEP_MINUTES === 0 && h.endMinute % BOOKING_STEP_MINUTES === 0,
    {
      message: `Hours snap to ${BOOKING_STEP_MINUTES}-minute steps`,
      path: ['startMinute'],
    }
  );
export type AvailabilityInput = z.input<typeof AvailabilityInputSchema>;
