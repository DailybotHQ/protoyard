import { analyticsFragments } from '@protoyard/analytics/generators';
import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds. Each starts from a shared preset in
 * @protoyard/scenarios (history, seasonality, density…) and layers Pebblestat's
 * own knobs on top; the analytics fragments add a launch spike or an outage.
 * Add one by appending an entry here AND listing its id in protoyard.json.
 *
 * `generators.pebblestat` is read by `generators.ts`:
 *   users       tracked users of the Web project at normal density (Mobile gets ~35 %)
 *   churn       { fromDaysAgo, toDaysAgo, keep }: of the users who signed up in that
 *               window, only the share `keep` stays active after their first week
 *   sampleRate  < 1: the Web project stores a user sample (every event of this
 *               share of users; `users` counts the sampled users), and `rollups`
 *               hold the full stream's daily counts per event type. Generating
 *               100k raw events (or even a 20k sample) would break the 50 ms
 *               generation budget, so enterprise scale keeps a 5 % sample.
 */

export const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

export interface PebblestatGeneratorOptions {
  users: number;
  churn?: { fromDaysAgo: number; toDaysAgo: number; keep: number };
  sampleRate?: number;
}

const organization = { id: 'org_0001', name: 'Pebblestat', size: 3 };
const knobs = (options: PebblestatGeneratorOptions) => ({ generators: { pebblestat: options } });

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', analyticsFragments.empty(), knobs({ users: 0 }), {
    id: 'new-project',
    name: 'New project, no data yet',
    description:
      'The tracking snippet was just installed: projects exist but no users or events have arrived. Every empty state.',
    seed: 101,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'trial' },
    actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
  }),
  presetScenario('quarter-of-history', knobs({ users: 80 }), {
    id: 'healthy-growth',
    name: 'Healthy growth',
    description:
      'Ninety days of steady growth with a weekly rhythm: saved reports, segments, two alerts and release annotations.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0001', role: 'owner' },
    tags: ['default'],
  }),
  // The preset is dense (×4 users): a smaller base keeps generation inside its budget.
  presetScenario('launch-spike', knobs({ users: 30 }), {
    id: 'launch-day',
    name: 'Launch day spike',
    description:
      'A launch three days ago brought a wave of signups; the analyst is reading the spike. A campaign annotation marks the day.',
    seed: 5150,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0002', role: 'analyst' },
  }),
  presetScenario(
    'quarter-of-history',
    knobs({ users: 80 }),
    analyticsFragments.outageDip(6, 2, 0.1),
    {
      id: 'outage-incident',
      name: 'Outage incident',
      description:
        'Ingestion dropped to a tenth for two days, six days ago: the page-view alert is firing and an incident annotation explains the gap.',
      seed: 4242,
      referenceTime: REFERENCE_TIME,
      organization: { ...organization, subscription: 'pro' },
      actor: { id: 'user_0001', role: 'owner' },
    }
  ),
  presetScenario(
    'quarter-of-history',
    knobs({ users: 80, churn: { fromDaysAgo: 56, toDaysAgo: 35, keep: 0.15 } }),
    {
      id: 'churn-risk',
      name: 'Churn-risk cohort',
      description:
        'Users who signed up five to eight weeks ago stopped coming back after their first week: their cohorts stand out on Retention.',
      seed: 7331,
      referenceTime: REFERENCE_TIME,
      organization: { ...organization, subscription: 'pro' },
      actor: { id: 'user_0002', role: 'analyst' },
    }
  ),
  presetScenario('quarter-of-history', knobs({ users: 360, sampleRate: 0.05 }), {
    id: 'enterprise-scale',
    name: 'Enterprise scale',
    description:
      'About 100,000 Web events in ninety days, stored as daily rollups per event type plus a 5 % user sample (about 5,000 raw events) for filters, funnels and retention.',
    seed: 9001,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'enterprise' },
    actor: { id: 'user_0001', role: 'owner' },
  }),
];
