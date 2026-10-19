import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { BookingDatabase } from '../src/database/schema.ts';
import { createServices } from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and opens a new one on the same storage, like a page
 * reload, so these prove persistence, not just in-memory state.
 */

let harness = createHarness<BookingDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<BookingDatabase>(definition);
});

// The reference time is Wednesday 2026-10-14 13:00 UTC; Thursday the 15th is open for every resource but Tom on Mondays.
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();
const slot = (h: number, durationH = 1, day = 15) => ({
  start: at(day, h),
  end: at(day, h + durationH),
});
const person = { customerName: 'Ada Lovelace', customerEmail: 'ada@example.com' };
const issues = (e: unknown) => (e instanceof ValidationError ? e.issues : {});

describe('booking services on the real runtime', () => {
  it('books, refuses an overlap, reschedules and cancels, surviving reloads', async () => {
    let runtime = await harness.boot('empty');
    let services = createServices(runtime);
    const booking = await services.bookings.create({
      resourceId: 'res_harbor',
      title: 'Planning',
      ...person,
      ...slot(10, 2),
    });
    expect(booking).toMatchObject({ status: 'confirmed', source: 'staff', createdBy: 'user_0001' });

    // 11:00–12:00 overlaps 10:00–12:00; 12:00–13:00 touches it and is fine (half-open spans).
    const conflict = await services.bookings
      .create({ resourceId: 'res_harbor', title: 'Overlap', ...person, ...slot(11) })
      .catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(ValidationError);
    expect(issues(conflict).start).toMatch(/overlaps “Planning”/);
    // Another resource at the same time is free.
    await services.bookings.create({
      resourceId: 'res_studio',
      title: 'Call',
      ...person,
      ...slot(11),
    });
    const next = await services.bookings.create({
      resourceId: 'res_harbor',
      title: 'Follow-up',
      ...person,
      ...slot(12),
    });

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect(await runtime.db.bookings.count()).toBe(3);
    // Moving into another booking is refused; moving into free time works.
    await expect(services.bookings.reschedule(next.id, slot(11))).rejects.toBeInstanceOf(
      ValidationError
    );
    await services.bookings.reschedule(next.id, slot(14));
    await services.bookings.cancel(booking.id, { reason: 'Client rescheduled' });
    // A cancelled booking frees its time.
    await services.bookings.create({
      resourceId: 'res_harbor',
      title: 'Reuse',
      ...person,
      ...slot(10),
    });

    runtime = await harness.reload(runtime);
    expect(await runtime.db.bookings.get(booking.id)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Client rescheduled',
    });
    expect((await runtime.db.bookings.get(next.id))?.start).toBe(at(15, 14));
    expect((await runtime.db.activity.toArray()).map((a) => a.type).sort()).toEqual([
      'booking.cancelled',
      'booking.created',
      'booking.created',
      'booking.created',
      'booking.created',
      'booking.rescheduled',
    ]);
  });

  it('refuses times outside opening hours, in the past, off the grid or not @example.com', async () => {
    const runtime = await harness.boot('empty');
    const services = createServices(runtime);
    const attempt = (input: Partial<Parameters<typeof services.bookings.create>[0]>) =>
      services.bookings
        .create({ resourceId: 'res_harbor', title: 'Test', ...person, ...slot(10), ...input })
        .catch((e: unknown) => issues(e));
    expect((await attempt(slot(18))).start).toMatch(/opening hours/); // Harbor closes at 18:00
    expect((await attempt({ start: at(14, 9), end: at(14, 10) })).start).toMatch(/future/);
    expect((await attempt({ start: at(15, 10, 10), end: at(15, 11) })).start).toMatch(/15-minute/);
    expect((await attempt({ customerEmail: 'ada@real-company.com' })).customerEmail).toMatch(
      /example\.com/
    );
    expect((await attempt({ end: at(15, 9) })).end).toMatch(/after the start/);
    expect(await runtime.db.bookings.count()).toBe(0);
  });

  it('lets a client book only free slots through the public flow, and nothing else', async () => {
    const runtime = await harness.boot('client');
    const services = createServices(runtime);
    const taken = await runtime.db.bookings
      .filter((b) => b.status === 'confirmed' && b.resourceId === 'res_ana' && b.start > at(14, 13))
      .first();
    if (!taken) throw new Error('the client scenario has upcoming bookings');
    const clash = await services.bookings
      .bookPublic({ resourceId: 'res_ana', ...person, start: taken.start, end: taken.end })
      .catch((e: unknown) => e);
    expect(issues(clash).start).toMatch(/overlaps/);
    await expect(
      services.bookings.create({ resourceId: 'res_ana', title: 'x', ...person, ...slot(9) })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.bookings.cancel(taken.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      services.availability.update('avail_res_ana_4', { startMinute: 600, endMinute: 900 })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('keeps the viewer read-only and writes nothing offline', async () => {
    const runtime = await harness.boot('viewer');
    const services = createServices(runtime);
    const before = await runtime.db.bookings.count();
    for (const attempt of [
      services.bookings.create({ resourceId: 'res_harbor', title: 'x', ...person, ...slot(8) }),
      services.bookings.bookPublic({ resourceId: 'res_harbor', ...person, ...slot(8) }),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(PermissionDeniedError);
    }
    await runtime.session.switchActor('user_0002'); // staff
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.bookings.create({
        resourceId: 'res_harbor',
        title: 'Offline',
        ...person,
        ...slot(8),
      })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect(await runtime.db.bookings.count()).toBe(before);
    expect(await runtime.db.activity.count()).toBe(0);
  });

  it('lets the owner change opening hours, which new bookings follow', async () => {
    const runtime = await harness.boot('empty');
    const services = createServices(runtime);
    await services.availability.update('avail_res_harbor_4', {
      startMinute: 8 * 60,
      endMinute: 20 * 60,
    });
    await services.bookings.create({
      resourceId: 'res_harbor',
      title: 'Evening',
      ...person,
      ...slot(18, 2),
    });
    await expect(
      services.availability.update('avail_res_harbor_4', { startMinute: 600, endMinute: 540 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('turns ended bookings into completed or no-show when simulated time advances', async () => {
    const runtime = await harness.boot('active');
    const today = await runtime.db.bookings
      .filter((b) => b.status === 'confirmed' && b.end > at(14, 13) && b.end <= at(16, 0))
      .toArray();
    expect(today.length).toBeGreaterThan(0);
    await runtime.scenarios.advance({ days: 2 });
    for (const b of today) {
      expect(['completed', 'no-show']).toContain((await runtime.db.bookings.get(b.id))?.status);
    }
  });

  it('loads every scenario', async () => {
    for (const id of definition.manifest.scenarios) {
      const runtime = await harness.boot(id);
      expect(await runtime.db.resources.count(), id).toBe(4);
      harness.closeAll();
      harness = createHarness<BookingDatabase>(definition);
    }
  }, 60_000);
});
