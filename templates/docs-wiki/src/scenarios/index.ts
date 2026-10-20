import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds built from the shared presets in
 * @protoyard/scenarios. Add one by appending an entry here AND listing its id
 * in protoyard.json → "scenarios".
 *
 * Knobs:
 *   generators.wiki.seed        false: no spaces or pages (every empty state)
 *   generators.wiki.extraPages  generated meeting notes and runbooks on top of the
 *                               curated pages (`large` sets about 1,450)
 */

export const REFERENCE_TIME = '2026-10-14T13:00:00.000Z';

export interface WikiGeneratorOptions {
  seed: boolean;
  extraPages: number;
}

const organization = { id: 'org_0001', name: 'Northwind Labs (fictional)', size: 4 };
const shared = {
  referenceTime: REFERENCE_TIME,
  organization: { ...organization, subscription: 'pro' as const },
};

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', {
    id: 'empty',
    name: 'Brand-new wiki',
    description:
      'No spaces or pages yet, seen by the owner: every empty state and the first space.',
    seed: 101,
    ...shared,
    actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
    generators: { wiki: { seed: false } },
  }),
  presetScenario('quarter-of-history', {
    id: 'active',
    name: 'Team wiki',
    description:
      'Three spaces with about 45 nested pages, months of version history, and a page of hostile Markdown the preview shows as text.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0002', role: 'editor' },
    generators: { wiki: { seed: true, extraPages: 0 } },
    tags: ['default'],
  }),
  presetScenario('quarter-of-history', {
    id: 'large',
    name: 'Large wiki',
    description:
      'About 1,500 pages (meeting notes and runbooks added to the team wiki): search and the tree at scale.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0002', role: 'editor' },
    generators: { wiki: { seed: true, extraPages: 1450 } },
  }),
  presetScenario('quarter-of-history', {
    id: 'viewer',
    name: 'Read-only reader',
    description: 'The team wiki seen by a viewer: read, search and browse history, but no edits.',
    seed: 4242,
    ...shared,
    actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 20 },
    generators: { wiki: { seed: true, extraPages: 0 } },
  }),
];
