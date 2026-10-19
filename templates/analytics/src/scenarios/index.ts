import { analyticsFragments } from '@protoyard/analytics/generators';
import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds. Each one starts from a shared
 * preset in @protoyard/scenarios (history, seasonality, density…) and layers
 * this template's identity and knobs on top; the analytics fragments add a
 * launch spike, an outage or massive density. Add one by appending an entry
 * here AND listing its id in protoyard.json → "scenarios".
 *
 * `generators.analytics` is read by `generators.ts`:
 *   users     tracked users at normal density (scaled by the density)
 *   outages   [{ daysAgo, days, depth }] from `analyticsFragments.outageDip`
 */

export const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

export interface AnalyticsGeneratorOptions {
  users: number;
}

const organization = { id: 'org_0001', name: 'Northwind Labs', size: 4 };
const users = (n: number) => ({ generators: { analytics: { users: n } } });

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', analyticsFragments.empty(), {
    id: 'empty',
    name: 'Brand-new workspace',
    description: 'Tracking was just installed: no users or events yet. Shows every empty state.',
    seed: 101,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'trial' },
    actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
  }),
  presetScenario('quarter-of-history', users(80), {
    id: 'active',
    name: 'Quarter of history',
    description:
      'Ninety days of steady product usage with a weekly rhythm, two saved segments and a busy dashboard.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0001', role: 'owner' },
    tags: ['default'],
  }),
  // The preset is dense (×4 users): a smaller base keeps the launch world inside its generation budget.
  presetScenario('launch-spike', users(30), {
    id: 'launch-spike',
    name: 'Launch spike',
    description:
      'A launch three days ago brought a wave of new signups; traffic is still settling back.',
    seed: 5150,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0001', role: 'owner' },
  }),
  presetScenario('quarter-of-history', users(80), analyticsFragments.outageDip(6, 2, 0.1), {
    id: 'outage',
    name: 'Outage last week',
    description:
      'Same quarter of history with a two-day incident six days ago: tracked events dropped to a tenth.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0002', role: 'admin' },
  }),
  // Massive density multiplies users by 25; a smaller base keeps generation inside its 50 ms budget.
  presetScenario('quarter-of-history', users(30), analyticsFragments.massive(), {
    id: 'massive',
    name: 'Massive workspace',
    description:
      'About 750 tracked users and seven times the events of the quarter scenario: for density, performance and paging.',
    seed: 9001,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'enterprise' },
    actor: { id: 'user_0001', role: 'owner' },
  }),
  presetScenario('quarter-of-history', users(80), {
    id: 'viewer',
    name: 'Read-only viewer',
    description:
      'Same world as “Quarter of history”, seen by a viewer: dashboards and segments can be read but not edited.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 14 },
  }),
];
