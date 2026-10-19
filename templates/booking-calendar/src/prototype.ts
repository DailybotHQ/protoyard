import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { type Booking, database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import {
  BOOKING_GENERATOR_VERSION,
  type BookingEndedPayload,
  bookingTimeline,
  generateBookingWorld,
} from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to the booking calendar's schema, policy, scenarios,
 * generator and timeline. Read this file first: schema → policy → scenarios
 * → generator → services (src/domain/services.ts) → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateBookingWorld,
  generatorVersion: BOOKING_GENERATOR_VERSION,
  timeline: bookingTimeline,
  // Advancing simulated time ends bookings: completed or no-show (cancelled or moved ones are skipped).
  applyEvent: async (event, ctx) => {
    if (event.type !== 'booking.ended') return;
    const { bookingId, outcome } = event.payload as BookingEndedPayload;
    const booking = (await ctx.get('bookings', bookingId)) as Booking | undefined;
    if (booking?.status !== 'confirmed' || booking.end !== event.at) return;
    await ctx.put('bookings', { ...booking, status: outcome, updatedAt: event.at });
  },
  integrity: {
    relations: {
      availability: { resourceId: 'resources' },
      bookings: { resourceId: 'resources', createdBy: 'py_personas' },
      activity: { bookingId: 'bookings', actorId: 'py_personas' },
    },
    timestamps: {
      bookings: ['createdAt', 'updatedAt'],
      activity: ['at'],
    },
  },
});
