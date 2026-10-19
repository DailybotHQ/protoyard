import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `BookingDatabase` below.
 *
 * Relationships: resource 1─* availability rule; resource 1─* booking.
 * `createdBy` and `actorId` reference personas in `py_personas`.
 * Every instant is an ISO 8601 UTC string; booking times are UTC.
 */

export const RESOURCE_KINDS = ['room', 'person'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** A bookable room or person. */
export type Resource = {
  id: string;
  name: string;
  kind: ResourceKind;
  /** People per booking (rooms) or 1 (a person's appointments). */
  capacity: number;
  description: string;
};

/** Opening hours of a resource on one weekday, `[startMinute, endMinute)` after UTC midnight. */
export type AvailabilityRule = {
  id: string;
  resourceId: string;
  /** 0 = Sunday … 6 = Saturday (UTC). */
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export const BOOKING_STATUSES = ['confirmed', 'cancelled', 'completed', 'no-show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type Booking = {
  id: string;
  resourceId: string;
  title: string;
  customerName: string;
  /** Fictional, `@example.com` only. */
  customerEmail: string;
  start: string;
  end: string;
  status: BookingStatus;
  /** `staff` (the calendar), `public` (the booking page) or `block` (a recurring internal block). */
  source: 'staff' | 'public' | 'block';
  cancelReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityType =
  | 'booking.created'
  | 'booking.booked_public'
  | 'booking.rescheduled'
  | 'booking.cancelled'
  | 'availability.updated';

/** Append-only audit trail written in the same transaction as the change it describes. */
export type Activity = {
  id: string;
  type: ActivityType;
  message: string;
  bookingId: string | null;
  actorId: string;
  at: string;
};

export type BookingDatabase = Dexie & {
  resources: EntityTable<Resource, 'id'>;
  availability: EntityTable<AvailabilityRule, 'id'>;
  bookings: EntityTable<Booking, 'id'>;
  activity: EntityTable<Activity, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        resources: 'id, kind',
        availability: 'id, resourceId, [resourceId+weekday]',
        // [resourceId+start] serves "this resource's bookings in a range" (the overlap check).
        bookings: 'id, resourceId, start, status, [resourceId+start]',
        activity: 'id, bookingId, actorId, at',
      },
    },
  ],
};
