import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type {
  Activity,
  ActivityType,
  AvailabilityRule,
  Booking,
  BookingDatabase,
} from '../database/schema.ts';
import { findConflict, withinAvailability } from './booking.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type AvailabilityInput,
  AvailabilityInputSchema,
  type BookingInput,
  BookingInputSchema,
  type CancelInput,
  CancelInputSchema,
  MAX_BOOKING_MINUTES,
  type PublicBookingInput,
  PublicBookingInputSchema,
  parse,
  type RescheduleInput,
  RescheduleInputSchema,
  ValidationError,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes in ONE Dexie transaction, which re-checks overlaps against the stored
 *      bookings, so two writers can never double-book a resource.
 */

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have been changed in another tab.`);
    this.name = 'NotFoundError';
  }
}

const time = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});
const describe = (b: Booking) =>
  `“${b.title}” (${time.format(Date.parse(b.start))}–${time.format(Date.parse(b.end))} UTC)`;

export function createServices(runtime: PrototypeRuntime<BookingDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const activity = (type: ActivityType, message: string, bookingId: string | null): Activity => ({
    id: createRuntimeId('activity'),
    type,
    message,
    bookingId,
    actorId: actorId(),
    at: now(),
  });

  /** Inside the transaction: the resource exists, the span is open, in the future and free. */
  async function assertBookable(
    span: { resourceId: string; start: string; end: string },
    exceptId?: string
  ) {
    if (!(await db.resources.get(span.resourceId))) {
      throw new ValidationError({ resourceId: 'That resource no longer exists' });
    }
    if (Date.parse(span.start) <= clock.now().getTime()) {
      throw new ValidationError({ start: 'Pick a time in the future' });
    }
    const rules = await db.availability.where('resourceId').equals(span.resourceId).toArray();
    if (!withinAvailability(rules, span)) {
      throw new ValidationError({ start: 'That time is outside the opening hours' });
    }
    // Bookings that could overlap start before this one ends and at most MAX before it starts.
    const nearby = await db.bookings
      .where('[resourceId+start]')
      .between(
        [
          span.resourceId,
          new Date(Date.parse(span.start) - MAX_BOOKING_MINUTES * 60_000).toISOString(),
        ],
        [span.resourceId, span.end],
        true,
        false
      )
      .toArray();
    const conflict = findConflict(nearby, span, exceptId);
    if (conflict) throw new ValidationError({ start: `That time overlaps ${describe(conflict)}` });
  }

  return {
    bookings: {
      /** Staff books a slot from the calendar ("confirm booking"). */
      async create(input: BookingInput): Promise<Booking> {
        session.assert(CAPABILITIES.bookingsManage);
        const data = parse(BookingInputSchema, input);
        return environment.run('bookings.confirm', () =>
          db.transaction(
            'rw',
            [db.resources, db.availability, db.bookings, db.activity],
            async () => {
              await assertBookable(data);
              const at = now();
              const booking: Booking = {
                id: createRuntimeId('booking'),
                resourceId: data.resourceId,
                title: data.title,
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                start: data.start,
                end: data.end,
                status: 'confirmed',
                source: 'staff',
                cancelReason: null,
                createdBy: actorId(),
                createdAt: at,
                updatedAt: at,
              };
              await db.bookings.add(booking);
              await db.activity.add(
                activity('booking.created', `Booked ${describe(booking)}`, booking.id)
              );
              return booking;
            }
          )
        );
      },

      /** A client books a free slot on the public page. */
      async bookPublic(input: PublicBookingInput): Promise<Booking> {
        session.assert(CAPABILITIES.bookingsBookPublic);
        const data = parse(PublicBookingInputSchema, input);
        return environment.run('bookings.confirm', () =>
          db.transaction(
            'rw',
            [db.resources, db.availability, db.bookings, db.activity],
            async () => {
              await assertBookable(data);
              const resource = await db.resources.get(data.resourceId);
              const at = now();
              const booking: Booking = {
                id: createRuntimeId('booking'),
                resourceId: data.resourceId,
                title: `${resource?.kind === 'person' ? 'Appointment' : 'Room booking'}: ${data.customerName}`,
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                start: data.start,
                end: data.end,
                status: 'confirmed',
                source: 'public',
                cancelReason: null,
                createdBy: actorId(),
                createdAt: at,
                updatedAt: at,
              };
              await db.bookings.add(booking);
              await db.activity.add(
                activity('booking.booked_public', `Public booking ${describe(booking)}`, booking.id)
              );
              return booking;
            }
          )
        );
      },

      /** Moves a confirmed booking (calendar drag or keyboard move); the new time must be free. */
      async reschedule(id: string, input: RescheduleInput): Promise<void> {
        session.assert(CAPABILITIES.bookingsManage);
        const data = parse(RescheduleInputSchema, input);
        await environment.run('bookings.reschedule', () =>
          db.transaction(
            'rw',
            [db.resources, db.availability, db.bookings, db.activity],
            async () => {
              const booking = await db.bookings.get(id);
              if (!booking) throw new NotFoundError('booking');
              if (booking.status !== 'confirmed') {
                throw new ValidationError({ start: 'Only confirmed bookings can move' });
              }
              const next = { ...booking, start: data.start, end: data.end, updatedAt: now() };
              await assertBookable(next, id);
              await db.bookings.put(next);
              await db.activity.add(
                activity(
                  'booking.rescheduled',
                  `Moved ${describe(booking)} to ${describe(next)}`,
                  id
                )
              );
            }
          )
        );
      },

      /** Cancels a confirmed booking that has not ended; its time becomes free again. */
      async cancel(id: string, input: CancelInput = {}): Promise<void> {
        session.assert(CAPABILITIES.bookingsManage);
        const { reason } = parse(CancelInputSchema, input);
        await environment.run('bookings.cancel', () =>
          db.transaction('rw', db.bookings, db.activity, async () => {
            const booking = await db.bookings.get(id);
            if (!booking) throw new NotFoundError('booking');
            if (
              booking.status !== 'confirmed' ||
              Date.parse(booking.end) <= clock.now().getTime()
            ) {
              throw new ValidationError({
                reason: 'Only upcoming confirmed bookings can be cancelled',
              });
            }
            await db.bookings.put({
              ...booking,
              status: 'cancelled',
              cancelReason: reason || null,
              updatedAt: now(),
            });
            await db.activity.add(
              activity('booking.cancelled', `Cancelled ${describe(booking)}`, id)
            );
          })
        );
      },
    },

    availability: {
      /** Changes one weekday's opening hours. Existing bookings stay; new ones follow the new hours. */
      async update(ruleId: string, input: AvailabilityInput): Promise<AvailabilityRule> {
        session.assert(CAPABILITIES.availabilityManage);
        const data = parse(AvailabilityInputSchema, input);
        return environment.run('availability.update', () =>
          db.transaction('rw', db.availability, db.activity, async () => {
            const rule = await db.availability.get(ruleId);
            if (!rule) throw new NotFoundError('opening-hours rule');
            const next = { ...rule, ...data };
            await db.availability.put(next);
            await db.activity.add(
              activity('availability.updated', `Changed opening hours (${ruleId})`, null)
            );
            return next;
          })
        );
      },
    },
  };
}

export type BookingServices = ReturnType<typeof createServices>;
