import { MS_PER_DAY, parseScenario, type Scenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { presetScenario, type ScheduledSlot, scenarioOccupancy, schedule } from '../src/index.ts';

const REF = '2026-06-03T12:15:00.000Z'; // Wednesday
const scenario = (overrides: Record<string, unknown> = {}): Scenario =>
  parseScenario({ id: 'demo', name: 'Demo', seed: 42, referenceTime: REF, ...overrides });
const ctx = { scenario: scenario() };
const resources = ['room-a', 'room-b', 'stylist-1'];

function overlaps(slots: readonly ScheduledSlot[]): boolean {
  const byResource = new Map<string, ScheduledSlot[]>();
  for (const slot of slots) {
    byResource.set(slot.resourceId, [...(byResource.get(slot.resourceId) ?? []), slot]);
  }
  for (const list of byResource.values()) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (Date.parse(sorted[i]?.start ?? '') < Date.parse(sorted[i - 1]?.end ?? '')) return true;
    }
  }
  return false;
}

describe('schedule', () => {
  it('is deterministic and never overlaps within a resource', () => {
    const slots = schedule({ ctx, resources, occupancy: 0.8 });
    expect(schedule({ ctx, resources, occupancy: 0.8 })).toEqual(slots);
    expect(slots.length).toBeGreaterThan(50);
    expect(overlaps(slots)).toBe(false);
    expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
    const other = schedule({ ctx: { scenario: scenario({ seed: 9 }) }, resources, occupancy: 0.8 });
    expect(other).not.toEqual(slots);
  });

  it('is day-stable: a wider window keeps the same slots for shared days', () => {
    const narrow = schedule({ ctx, resources, window: { daysBefore: 2, daysAfter: 2 } });
    const wide = schedule({ ctx, resources, window: { daysBefore: 20, daysAfter: 20 } });
    const days = new Set(narrow.map((s) => s.start.slice(0, 10)));
    expect(wide.filter((s) => days.has(s.start.slice(0, 10)))).toEqual(narrow);
  });

  it('keeps bookings inside business hours on open days and sets status from the reference time', () => {
    const slots = schedule({ ctx, resources, businessHours: [10, 16], occupancy: 1 });
    for (const slot of slots) {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      expect([1, 2, 3, 4, 5]).toContain(start.getUTCDay());
      expect(start.getUTCHours()).toBeGreaterThanOrEqual(10);
      expect(end.getTime()).toBeLessThanOrEqual(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 16)
      );
      expect([30, 60, 120]).toContain(slot.durationMinutes);
      const ref = Date.parse(REF);
      const expected =
        end.getTime() <= ref ? 'past' : start.getTime() <= ref ? 'in-progress' : 'upcoming';
      expect(slot.status).toBe(expected);
    }
    expect(slots.some((s) => s.status === 'past')).toBe(true);
    expect(slots.some((s) => s.status === 'upcoming')).toBe(true);
  });

  it('occupancy controls how full the calendar is', () => {
    const booked = (occupancy: number) =>
      schedule({ ctx, resources, occupancy }).reduce((sum, s) => sum + s.durationMinutes, 0);
    expect(booked(0)).toBe(0);
    expect(booked(0.9)).toBeGreaterThan(booked(0.3) * 1.5);
  });

  it('places recurring blocks first, on their days, without overlaps', () => {
    const slots = schedule({
      ctx,
      resources,
      occupancy: 1,
      window: { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-07-01T00:00:00Z') },
      recurring: [
        { label: 'Stand-up', every: 'daily', startMinute: 9 * 60, durationMinutes: 15 },
        { label: 'Review', every: 'weekly', weekday: 5, startMinute: 15 * 60, durationMinutes: 60 },
        {
          label: 'Maintenance',
          every: 'monthly',
          dayOfMonth: 1,
          startMinute: 6 * 60,
          durationMinutes: 120,
          resources: ['room-a'],
        },
      ],
    });
    expect(overlaps(slots)).toBe(false);
    const standUps = slots.filter((s) => s.recurring === 'Stand-up');
    expect(standUps).toHaveLength(30 * resources.length);
    const reviews = slots.filter((s) => s.recurring === 'Review');
    expect(reviews.every((s) => new Date(s.start).getUTCDay() === 5)).toBe(true);
    expect(reviews).toHaveLength(4 * resources.length);
    expect(slots.filter((s) => s.recurring === 'Maintenance').map((s) => s.resourceId)).toEqual([
      'room-a',
    ]);
  });

  it('only returns slots inside an explicit window', () => {
    const from = new Date(Date.parse(REF) - MS_PER_DAY);
    const to = new Date(Date.parse(REF) + MS_PER_DAY);
    for (const slot of schedule({ ctx, resources, window: { from, to }, occupancy: 1 })) {
      expect(Date.parse(slot.end)).toBeGreaterThan(from.getTime());
      expect(Date.parse(slot.start)).toBeLessThan(to.getTime());
    }
  });

  it('defaults occupancy from the busy-week preset knob', () => {
    const busy = presetScenario('busy-week');
    expect(scenarioOccupancy({ scenario: busy })).toBe(0.9);
    expect(scenarioOccupancy(ctx)).toBe(0.5);
    const total = (s: Scenario) =>
      schedule({ ctx: { scenario: s }, resources }).reduce(
        (n, slot) => n + slot.durationMinutes,
        0
      );
    expect(total(busy)).toBeGreaterThan(total(presetScenario('active-month')));
  });

  it('rejects invalid hours and grids', () => {
    expect(() => schedule({ ctx, resources, businessHours: [17, 9] })).toThrow(/businessHours/);
    expect(() => schedule({ ctx, resources, slotMinutes: 0 })).toThrow(/slotMinutes/);
    expect(() => schedule({ ctx, resources, durations: [0] })).toThrow(/durations/);
  });
});
