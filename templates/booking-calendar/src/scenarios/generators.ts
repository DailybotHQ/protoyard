import {
  type DomainEvent,
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import { schedule } from '@protoyard/scenarios';
import type { Activity, AvailabilityRule, Booking, Resource } from '../database/schema.ts';
import { outcomeFor, withinAvailability } from '../domain/booking.ts';
import type { BookingGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder. Bookings come from `schedule()` in
 * @protoyard/scenarios: each (resource, day) has its own rng, so slots never
 * overlap and a day's bookings never depend on the window asked for.
 * Everything else uses `ctx.rng` forks, `ctx.faker`, `ctx.ids` and the
 * scenario reference time. Order: people → resources and hours → bookings.
 */

/** Bump when the same seed would produce a different world. */
export const BOOKING_GENERATOR_VERSION = 1;

const PEOPLE = [
  { id: 'user_0001', name: 'Nora Lind', title: 'Studio owner', role: 'owner', color: '#0d9488' },
  { id: 'user_0002', name: 'Sam Okoro', title: 'Front desk', role: 'staff', color: '#7c3aed' },
  {
    id: 'user_0003',
    name: 'Priya Das',
    title: 'Accountant (read-only)',
    role: 'viewer',
    color: '#d97706',
  },
  { id: 'user_0004', name: 'Leo Martins', title: 'Client', role: 'client', color: '#2563eb' },
] as const;

const RESOURCES: (Resource & { hours: { weekdays: number[]; open: number; close: number }[] })[] = [
  {
    id: 'res_harbor',
    name: 'Harbor room',
    kind: 'room',
    capacity: 8,
    description: 'Meeting room with a screen, for workshops and planning.',
    hours: [{ weekdays: [1, 2, 3, 4, 5], open: 8, close: 18 }],
  },
  {
    id: 'res_studio',
    name: 'Studio',
    kind: 'room',
    capacity: 4,
    description: 'Quiet recording and call room.',
    hours: [{ weekdays: [1, 2, 3, 4, 5], open: 9, close: 17 }],
  },
  {
    id: 'res_ana',
    name: 'Coach Ana Ruiz',
    kind: 'person',
    capacity: 1,
    description: 'Career coaching, weekdays and Saturday mornings.',
    hours: [
      { weekdays: [1, 2, 3, 4, 5], open: 9, close: 17 },
      { weekdays: [6], open: 10, close: 14 },
    ],
  },
  {
    id: 'res_tom',
    name: 'Coach Tom Hale',
    kind: 'person',
    capacity: 1,
    description: 'Interview practice, Tuesday to Friday.',
    hours: [{ weekdays: [2, 3, 4, 5], open: 10, close: 18 }],
  },
];

const TITLES: Record<Resource['kind'], readonly string[]> = {
  room: [
    'Team planning',
    'Client workshop',
    'Design review',
    'Hiring panel',
    'Quarterly kickoff',
    'Podcast recording',
  ],
  person: ['Intro session', 'Follow-up', 'CV review', 'Mock interview', 'Career plan'],
};
const CANCEL_REASONS = ['Client rescheduled', 'Illness', 'Double-booked elsewhere', 'Weather'];

function options(ctx: GenerateContext): BookingGeneratorOptions {
  const raw = (ctx.scenario.generators.booking ?? {}) as Partial<BookingGeneratorOptions>;
  return { seed: raw.seed !== false };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const subscription = scenario.organization.subscription;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Harbor Studio',
    type: 'company',
    plan: subscription === 'trial' || subscription === 'expired' ? 'pro' : subscription,
    billingStatus:
      subscription === 'expired' ? 'expired' : subscription === 'trial' ? 'trialing' : 'active',
    createdAt: time.iso(time.daysAgo(ageDays)),
    size: PEOPLE.length,
    featureFlags: { ...scenario.organization.featureFlags },
  };
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  PEOPLE.forEach((p, index) => {
    const days =
      p.id === scenario.actor.id
        ? Math.min(ageDays, scenario.actor.joinedDaysAgo)
        : index === 0
          ? ageDays
          : Math.round(ageDays * (1 - index / (PEOPLE.length + 1)));
    const joinedAt = time.iso(time.daysAgo(days));
    const role = p.id === scenario.actor.id ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
      title: p.title,
      avatarColor: p.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${p.title} · ${role}, joined ${days === 0 ? 'today' : `${days} days ago`}`,
    });
    memberships.push({
      id: `membership_${String(index + 1).padStart(4, '0')}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  });
  return { organization, personas, memberships };
}

export function generateBookingWorld(ctx: GenerateContext): WorldSeed {
  const { organization, personas, memberships } = identities(ctx);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const orgCreated = Date.parse(organization.createdAt);
  const resources: Resource[] = RESOURCES.map(({ hours: _hours, ...r }) => r);
  const availability: AvailabilityRule[] = RESOURCES.flatMap((r) =>
    r.hours.flatMap((h) =>
      h.weekdays.map((weekday) => ({
        id: `avail_${r.id}_${weekday}`,
        resourceId: r.id,
        weekday,
        startMinute: h.open * 60,
        endMinute: h.close * 60,
      }))
    )
  );

  const bookings: Booking[] = [];
  if (options(ctx).seed) {
    // One schedule() call per opening-hours shape; slots outside a resource's hours are dropped.
    const slots = RESOURCES.flatMap((r) =>
      r.hours.flatMap((h) =>
        schedule({
          ctx,
          resources: [r.id],
          window: { daysBefore: 21, daysAfter: 14 },
          businessHours: [h.open, h.close],
          openDays: h.weekdays,
          slotMinutes: 30,
          durations: r.kind === 'room' ? [2, 3, 4] : [1, 2],
          recurring:
            r.kind === 'room'
              ? [
                  {
                    label: 'Weekly cleaning',
                    every: 'weekly',
                    weekday: 5,
                    startMinute: (h.close - 1) * 60,
                    durationMinutes: 60,
                  },
                ]
              : [],
        })
      )
    ).sort((a, b) =>
      a.start < b.start ? -1 : a.start > b.start ? 1 : a.resourceId < b.resourceId ? -1 : 1
    );

    const rng = ctx.rng.fork('bookings');
    const authors = memberships.filter((m) => m.role === 'owner' || m.role === 'staff');
    for (const slot of slots) {
      if (!withinAvailability(availability, slot)) continue;
      const resource = resources.find((r) => r.id === slot.resourceId) as Resource;
      const id = ctx.ids.next('booking');
      const first = ctx.faker.person.firstName();
      const last = ctx.faker.person.lastName();
      const block = slot.recurring !== null;
      const start = Date.parse(slot.start);
      // Booked one to ten days ahead, never before the studio existed or after "now".
      const createdMs = Math.max(orgCreated, Math.min(ref, start - rng.int(1, 10) * MS_PER_DAY));
      const createdAt = new Date(createdMs).toISOString();
      const ended = Date.parse(slot.end) <= ref;
      const cancelled = !block && rng.chance(0.08);
      const status: Booking['status'] = cancelled
        ? 'cancelled'
        : ended && !block
          ? outcomeFor(ctx.scenario.seed, id)
          : ended
            ? 'completed'
            : 'confirmed';
      bookings.push({
        id,
        resourceId: slot.resourceId,
        title: block ? (slot.recurring as string) : rng.pick(TITLES[resource.kind]),
        customerName: block ? 'Harbor Studio' : `${first} ${last}`,
        customerEmail: block
          ? 'facilities@example.com'
          : `${`${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '')}@example.com`,
        start: slot.start,
        end: slot.end,
        status,
        source: block ? 'block' : rng.chance(0.4) ? 'public' : 'staff',
        cancelReason: cancelled ? rng.pick(CANCEL_REASONS) : null,
        createdBy: (rng.pick(authors) ?? authors[0])?.personaId ?? 'user_0001',
        createdAt,
        updatedAt: cancelled
          ? new Date(Math.min(ref, Math.max(createdMs, start - MS_PER_DAY))).toISOString()
          : createdAt,
      });
    }
  }
  const activity: Activity[] = [];
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { resources, availability, bookings, activity },
  };
}

/** The payload of a `booking.ended` timeline event. */
export interface BookingEndedPayload {
  bookingId: string;
  outcome: 'completed' | 'no-show';
}

/**
 * Simulated time: every confirmed booking that ends inside the advanced
 * window becomes completed or a no-show. The event id and outcome depend
 * only on the booking, so one long advance equals many short ones.
 */
export async function bookingTimeline(
  ctx: TimelineContext
): Promise<DomainEvent<BookingEndedPayload>[]> {
  const rows = (await ctx.read('bookings')) as unknown as Booking[];
  const from = ctx.from.getTime();
  const to = ctx.to.getTime();
  return rows
    .filter((b) => b.status === 'confirmed' && Date.parse(b.end) > from && Date.parse(b.end) <= to)
    .sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.id < b.id ? -1 : 1))
    .map((b) => ({
      id: `booking-ended:${b.id}`,
      type: 'booking.ended',
      at: b.end,
      payload: {
        bookingId: b.id,
        outcome: b.source === 'block' ? 'completed' : outcomeFor(ctx.scenario.seed, b.id),
      },
      source: 'timeline' as const,
    }));
}
