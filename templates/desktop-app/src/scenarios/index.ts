import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds. Each one starts from a shared
 * preset in @protoyard/scenarios (lifecycle, density…) and layers this
 * template's identity and knobs on top. Add one by appending an entry here
 * AND listing its id in protoyard.json → "scenarios".
 *
 * `generators.desktop` is read by `generators.ts`:
 *   folders             how many folders to create
 *   documentsPerFolder  [min, max] documents per folder
 *   tags                how many tags to create (max 8)
 */

export const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

export interface DesktopGeneratorOptions {
  folders: number;
  documentsPerFolder: [number, number];
  tags: number;
}

const organization = { id: 'org_0001', name: 'Fieldnote Studio', size: 3 };

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', {
    id: 'empty',
    name: 'Fresh install',
    description:
      'The app was just installed: one empty Inbox folder, no documents and no tags. Shows every empty state.',
    seed: 11,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
    generators: { desktop: { folders: 0, documentsPerFolder: [0, 0], tags: 0 } },
  }),
  presetScenario('active-month', {
    id: 'active',
    name: 'Active workspace',
    description:
      'A month of use: a handful of folders, a few dozen notes with tags and a couple of pinned documents.',
    seed: 2026,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: { id: 'user_0001', role: 'owner' },
    generators: { desktop: { folders: 5, documentsPerFolder: [3, 9], tags: 6 } },
    tags: ['default'],
  }),
  presetScenario('power-user-year-one', {
    id: 'large',
    name: 'Large library',
    description:
      'A year of heavy use: 24 folders and several hundred documents. Good for search, scrolling and performance.',
    seed: 90210,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: { id: 'user_0001', role: 'owner' },
    generators: { desktop: { folders: 24, documentsPerFolder: [8, 24], tags: 8 } },
  }),
];
