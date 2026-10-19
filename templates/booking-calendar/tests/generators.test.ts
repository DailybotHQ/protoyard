import { MS_PER_DAY, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { AvailabilityRule, Booking } from '../src/database/schema.ts';
import { freeSlots, outcomeFor, overlaps, withinAvailability } from '../src/domain/booking.ts';
import { definition } from '../src/prototype.ts';
import { bookingTimeline, generateBookingWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const world = (id: string) => generateBookingWorld(contextFor(id));
const rows = <T>(w: WorldSeed, table: string) => (w.tables[table] ?? []) as unknown as T[];
const REF = Date.parse('2026-10-14T13:00:00.000Z');

describe('booking generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = world('active');
    expect(world('active')).toEqual(a);
    expect(generateBookingWorld(contextFor('active', 77)).tables.bookings).not.toEqual(
      a.tables.bookings
    );
  });

  it.each(definition.scenarios.map((s) => s.id))(
    '%s passes integrity and never double-books',
    (id) => {
      const ctx = contextFor(id);
      const w = generateBookingWorld(ctx);
      expect(
        validateWorld(w, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime })
      ).toEqual([]);
      expect(w.memberships.find((m) => m.personaId === ctx.scenario.actor.id)?.role).toBe(
        ctx.scenario.actor.role
      );
      const bookings = rows<Booking>(w, 'bookings');
      const rules = rows<AvailabilityRule>(w, 'availability');
      const held = bookings.filter((b) => b.status !== 'cancelled');
      for (const b of held) {
        expect(withinAvailability(rules, b), b.id).toBe(true);
        expect(
          held.some((o) => o.id !== b.id && o.resourceId === b.resourceId && overlaps(o, b)),
          b.id
        ).toBe(false);
        expect(b.customerEmail.endsWith('@example.com')).toBe(true);
      }
    }
  );

  it('marks ended bookings completed or no-show and keeps upcoming ones confirmed', () => {
    const bookings = rows<Booking>(world('active'), 'bookings');
    expect(bookings.length).toBeGreaterThan(80);
    const ended = bookings.filter((b) => Date.parse(b.end) <= REF && b.status !== 'cancelled');
    const upcoming = bookings.filter((b) => Date.parse(b.start) > REF && b.status !== 'cancelled');
    expect(ended.every((b) => b.status === 'completed' || b.status === 'no-show')).toBe(true);
    expect(ended.some((b) => b.status === 'no-show')).toBe(true);
    expect(upcoming.every((b) => b.status === 'confirmed')).toBe(true);
    expect(bookings.some((b) => b.status === 'cancelled' && b.cancelReason)).toBe(true);
    expect(bookings.some((b) => b.source === 'block' && b.title === 'Weekly cleaning')).toBe(true);
  });

  it('scales from an empty calendar to a busy week', () => {
    const empty = world('empty');
    expect(rows(empty, 'bookings')).toHaveLength(0);
    expect(rows(empty, 'resources')).toHaveLength(4);
    const active = rows<Booking>(world('active'), 'bookings').length;
    expect(rows<Booking>(world('busy-week'), 'bookings').length).toBeGreaterThan(active * 1.2);
  });

  it('gives the viewer and client scenarios the same setup and occupancy as the active one', () => {
    // schedule() seeds each (resource, day) by scenario id, so the bookings differ but the shape does not.
    const active = world('active');
    for (const id of ['viewer', 'client']) {
      const w = world(id);
      expect(w.tables.resources).toEqual(active.tables.resources);
      expect(w.tables.availability).toEqual(active.tables.availability);
      const n = rows(w, 'bookings').length;
      const m = rows(active, 'bookings').length;
      expect(Math.abs(n - m) / m, id).toBeLessThan(0.2);
    }
  });
});

describe('booking rules', () => {
  const rules: AvailabilityRule[] = [
    { id: 'r', resourceId: 'res', weekday: 3, startMinute: 9 * 60, endMinute: 12 * 60 },
  ];
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h, m)).toISOString(); // a Wednesday
  const booking = (
    start: string,
    end: string,
    status: Booking['status'] = 'confirmed'
  ): Booking => ({
    id: `b-${start}`,
    resourceId: 'res',
    title: 'x',
    customerName: 'x',
    customerEmail: 'x@example.com',
    start,
    end,
    status,
    source: 'staff',
    cancelReason: null,
    createdBy: 'user_0001',
    createdAt: at(8),
    updatedAt: at(8),
  });

  it('treats spans as half-open and only confirmed bookings as holding time', () => {
    expect(overlaps({ start: at(9), end: at(10) }, { start: at(10), end: at(11) })).toBe(false);
    expect(overlaps({ start: at(9), end: at(10, 30) }, { start: at(10), end: at(11) })).toBe(true);
    expect(withinAvailability(rules, { resourceId: 'res', start: at(11), end: at(12) })).toBe(true);
    expect(
      withinAvailability(rules, { resourceId: 'res', start: at(11, 30), end: at(12, 30) })
    ).toBe(false);
  });

  it('offers only free, future slots inside the opening hours', () => {
    const slots = freeSlots({
      rules,
      bookings: [booking(at(10), at(11)), booking(at(9), at(9, 30), 'cancelled')],
      resourceId: 'res',
      day: '2026-10-14',
      durationMinutes: 60,
      now: new Date(at(8)),
    });
    expect(slots.map((s) => s.start.slice(11, 16))).toEqual(['09:00', '11:00']);
    expect(
      freeSlots({
        rules,
        bookings: [],
        resourceId: 'res',
        day: '2026-10-14',
        durationMinutes: 60,
        now: new Date(at(10, 15)),
      }).map((s) => s.start.slice(11, 16))
    ).toEqual(['10:30', '11:00']);
  });

  it('decides no-shows from the seed and the booking only', () => {
    const outcomes = Array.from({ length: 400 }, (_, i) => outcomeFor(4242, `booking_${i}`));
    expect(outcomes).toEqual(
      Array.from({ length: 400 }, (_, i) => outcomeFor(4242, `booking_${i}`))
    );
    const share = outcomes.filter((o) => o === 'no-show').length / outcomes.length;
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.2);
  });

  it('ends bookings on the timeline, window-independently', async () => {
    const ctx = contextFor('active');
    const bookings = rows<Booking>(world('active'), 'bookings');
    const read = async () => bookings as never[];
    const from = new Date(REF);
    const plus = (d: number) => new Date(REF + d * MS_PER_DAY);
    const once = await bookingTimeline({ ...ctx, from, to: plus(3), read });
    const steps = [
      ...(await bookingTimeline({ ...ctx, from, to: plus(1), read })),
      ...(await bookingTimeline({ ...ctx, from: plus(1), to: plus(2), read })),
      ...(await bookingTimeline({ ...ctx, from: plus(2), to: plus(3), read })),
    ];
    expect(once.length).toBeGreaterThan(5);
    expect(steps).toEqual(once);
    expect(
      once.every((e) => e.payload.outcome === 'completed' || e.payload.outcome === 'no-show')
    ).toBe(true);
  });
});
