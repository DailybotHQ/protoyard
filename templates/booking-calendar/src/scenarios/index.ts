import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds built from the shared presets in
 * @protoyard/scenarios. Add one by appending an entry here AND listing its id
 * in protoyard.json → "scenarios".
 *
 * Knobs:
 *   generators.schedule.occupancy  share of free slots that start a booking
 *                                  (read by `schedule()`; `busy-week` sets 0.9)
 *   generators.booking.seed        false: resources and hours only, no bookings
 *
 * `schedule()` seeds each (resource, day) by scenario id and seed, so two
 * scenarios with the same seed and knobs share resources, hours and
 * occupancy, but not the exact bookings.
 */

export const REFERENCE_TIME = '2026-10-14T13:00:00.000Z'; // a Wednesday afternoon

export interface BookingGeneratorOptions {
  seed: boolean;
}

const organization = { id: 'org_0001', name: 'Harbor Studio', size: 4 };
const shared = {
  referenceTime: REFERENCE_TIME,
  organization: { ...organization, subscription: 'pro' as const },
};

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', {
    id: 'empty',
    name: 'Brand-new calendar',
    description:
      'Rooms, coaches and opening hours are set up; nothing is booked yet. Every empty state.',
    seed: 101,
    ...shared,
    organization: { ...organization, subscription: 'trial' },
    actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
    generators: { booking: { seed: false } },
  }),
  presetScenario('active-month', {
    id: 'active',
    name: 'Ordinary week',
    description:
      'Three weeks of history and two weeks ahead at about half occupancy, a few cancellations and no-shows.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0001', role: 'owner' },
    generators: { schedule: { occupancy: 0.5 }, booking: { seed: true } },
    tags: ['default'],
  }),
  presetScenario('busy-week', {
    id: 'busy-week',
    name: 'Busy week',
    description:
      'Nearly every slot is taken (occupancy 0.9): new bookings mostly hit conflicts and the public page has few free times.',
    seed: 7007,
    ...shared,
    actor: { id: 'user_0002', role: 'staff' },
    generators: { booking: { seed: true } },
  }),
  presetScenario('active-month', {
    id: 'viewer',
    name: 'Read-only viewer',
    description:
      'The “Ordinary week” setup and occupancy, seen by a viewer: nothing can be booked, moved or cancelled.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0003', role: 'viewer', joinedDaysAgo: 10 },
    generators: { schedule: { occupancy: 0.5 }, booking: { seed: true } },
  }),
  presetScenario('active-month', {
    id: 'client',
    name: 'Client booking online',
    description:
      'The “Ordinary week” setup and occupancy, seen by a client who can only use the public booking page.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0004', role: 'client', joinedDaysAgo: 2 },
    generators: { schedule: { occupancy: 0.5 }, booking: { seed: true } },
  }),
];
