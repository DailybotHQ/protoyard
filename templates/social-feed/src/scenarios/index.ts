import type { ScenarioInput } from '@protoyard/core';
import { fragments, presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds built from the shared presets in
 * @protoyard/scenarios. Add one by appending an entry here AND listing its id
 * in protoyard.json → "scenarios".
 *
 * Knobs (`generators.social`):
 *   postsPerDay  mean posts per day at normal density (scaled by the density; massive ×25)
 *   days         days of history
 *   seed         false: people only, no posts or activity
 */

export const REFERENCE_TIME = '2026-10-16T15:00:00.000Z';

export interface SocialGeneratorOptions {
  postsPerDay: number;
  days: number;
  seed: boolean;
}

const organization = { id: 'org_0001', name: 'Fieldnotes', size: 3 };
const knobs = (o: Partial<SocialGeneratorOptions>) => ({ generators: { social: o } });

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', knobs({ seed: false }), {
    id: 'empty',
    name: 'Brand-new network',
    description:
      'People have joined but nobody has posted yet. Every empty state, and the composer is ready.',
    seed: 101,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'trial' },
    actor: { id: 'user_0001', role: 'member', onboardingComplete: true },
  }),
  presetScenario('active-month', knobs({ postsPerDay: 8, days: 30 }), {
    id: 'active',
    name: 'Lively community',
    description:
      'A month of posts, reactions and comments; you follow a dozen people and have a few unread notifications.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0001', role: 'member' },
    tags: ['default'],
  }),
  presetScenario(
    'active-month',
    knobs({ postsPerDay: 8, days: 30 }),
    fragments.density('massive'),
    {
      id: 'massive',
      name: 'Massive feed',
      description:
        'About 6,000 posts in a month (25× the density): the feed renders only the rows on screen.',
      seed: 9001,
      referenceTime: REFERENCE_TIME,
      organization: { ...organization, subscription: 'enterprise' },
      actor: { id: 'user_0001', role: 'member' },
    }
  ),
  presetScenario('active-month', knobs({ postsPerDay: 8, days: 30 }), {
    id: 'moderator',
    name: 'Moderator view',
    description: 'The “Lively community” shape seen by a moderator, who can remove anyone’s post.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0002', role: 'moderator' },
  }),
  presetScenario('active-month', knobs({ postsPerDay: 8, days: 30 }), {
    id: 'viewer',
    name: 'Read-only viewer',
    description:
      'The “Lively community” shape seen by a viewer, who can read but not post, react, comment or follow.',
    seed: 4242,
    referenceTime: REFERENCE_TIME,
    organization: { ...organization, subscription: 'pro' },
    actor: { id: 'user_0003', role: 'viewer', joinedDaysAgo: 5 },
  }),
];
