import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds. Each one starts from a shared
 * preset in @protoyard/scenarios (lifecycle, role, density…) and layers this
 * template's own identity and knobs on top. Add one by appending an entry
 * here AND listing its id in protoyard.json → "scenarios".
 *
 * `generators.dashboard` is read by `generators.ts`:
 *   customers         how many customers to create
 *   ordersPerCustomer [min, max] orders per paying customer
 */

export const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

export interface DashboardGeneratorOptions {
  customers: number;
  ordersPerCustomer: [number, number];
}

const organization = { id: 'org_0001', name: 'Acme Cloud', size: 4 };

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', {
    id: 'empty',
    name: 'Brand-new workspace',
    description: 'The owner just signed up: no customers or orders yet. Shows every empty state.',
    seed: 101,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'trial' },
    actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
    generators: { dashboard: { customers: 0, ordersPerCustomer: [0, 0] } },
  }),
  presetScenario('active-month', {
    id: 'active',
    name: 'Active month',
    description:
      'Thirty days in: a few dozen customers, steady orders in every status and a busy audit trail.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0001', role: 'owner' },
    generators: { dashboard: { customers: 36, ordersPerCustomer: [1, 5] } },
    tags: ['default'],
  }),
  presetScenario('power-user-year-one', {
    id: 'massive',
    name: 'Massive operations year',
    description:
      'A year of heavy use: 180 fictional customers and close to a thousand orders. Good for density, pagination and performance.',
    seed: 9001,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'enterprise' },
    actor: { id: 'user_0001', role: 'owner' },
    generators: { dashboard: { customers: 180, ordersPerCustomer: [2, 8] } },
  }),
  presetScenario('read-only-viewer', {
    id: 'viewer',
    name: 'Read-only viewer',
    description:
      'Same world as “Active month”, seen by a viewer: every create, edit, delete and settings control is hidden and blocked.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    // Same organization age as `active`, so the generated world is identical.
    organization: { ...organization, ageDays: 30, subscription: 'pro' },
    actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 14 },
    generators: { dashboard: { customers: 36, ordersPerCustomer: [1, 5] } },
  }),
];
