import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds built from the shared presets in
 * @protoyard/scenarios. Add one by appending an entry here AND listing its id
 * in protoyard.json → "scenarios".
 *
 * Knobs:
 *   generators.schedule.occupancy  share of free slots that start an appointment
 *                                  (read by `schedule()`; `busy-week` sets 0.9)
 *   generators.clinic.patients     how many fictional patients to generate
 *   generators.clinic.seed         false: providers and hours only, no patients
 *
 * `schedule()` seeds each (provider, day) by scenario id and seed, so two
 * scenarios with the same seed and knobs share providers, hours, patients and
 * occupancy, but not the exact appointments.
 *
 * Every patient is generated and fictional (`@example.com`, `+1 555-01xx`).
 */

export const REFERENCE_TIME = '2026-10-14T13:00:00.000Z'; // a Wednesday afternoon

export interface ClinicGeneratorOptions {
  seed: boolean;
  patients: number;
}

const organization = { id: 'org_0001', name: 'Maple Grove Clinic (fictional)', size: 6 };
const shared = {
  referenceTime: REFERENCE_TIME,
  organization: { ...organization, subscription: 'pro' as const },
};

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', {
    id: 'empty',
    name: 'Brand-new clinic',
    description:
      'Providers and clinic hours are set up; no patients or appointments yet. Every empty state.',
    seed: 101,
    ...shared,
    actor: { id: 'user_0001', role: 'admin', onboardingComplete: true },
    generators: { clinic: { seed: false } },
  }),
  presetScenario('active-month', {
    id: 'active',
    name: 'Ordinary Wednesday',
    description:
      'The front desk mid-afternoon: 160 fictional patients, two weeks of history, patients waiting and a week ahead booked at about 60 %.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0002', role: 'front-desk' },
    generators: { schedule: { occupancy: 0.6 }, clinic: { seed: true, patients: 160 } },
    tags: ['default'],
  }),
  presetScenario('busy-week', {
    id: 'busy-clinic',
    name: 'Busy clinic',
    description:
      '2,000 fictional patients and nearly every slot taken (occupancy 0.9): new bookings mostly hit conflicts.',
    seed: 7007,
    ...shared,
    actor: { id: 'user_0002', role: 'front-desk' },
    generators: { clinic: { seed: true, patients: 2000 } },
  }),
  presetScenario('active-month', {
    id: 'clinician',
    name: 'Clinician’s day',
    description:
      'The “Ordinary Wednesday” setup and occupancy, seen by Dr. Mei Tan: write and sign visit notes for checked-in patients.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0003', role: 'clinician' },
    generators: { schedule: { occupancy: 0.6 }, clinic: { seed: true, patients: 160 } },
  }),
  presetScenario('active-month', {
    id: 'viewer',
    name: 'Read-only reviewer',
    description:
      'The “Ordinary Wednesday” setup seen by a read-only reviewer: sensitive fields stay masked and visit notes are hidden.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0006', role: 'viewer', joinedDaysAgo: 10 },
    generators: { schedule: { occupancy: 0.6 }, clinic: { seed: true, patients: 160 } },
  }),
];
