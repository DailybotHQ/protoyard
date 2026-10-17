import type { ScenarioInput } from '@protoyard/core';

/**
 * Scenarios are versioned, seeded worlds. Add one by appending an entry here
 * AND listing its id in protoyard.json → "scenarios". `generators.items` is a
 * template-specific knob read by `generators.ts`. Scenarios can also extend
 * shared presets: `{ id: 'first-week', extends: 'first-week', … }`.
 */

const referenceTime = '2026-10-16T09:00:00.000Z';
const organization = { id: 'org_0001', name: 'Pocket Studio', size: 2 } as const;

export const scenarios: ScenarioInput[] = [
  {
    id: 'empty',
    name: 'First launch',
    description: 'The owner just installed the app: nothing yet. Shows the empty state.',
    group: 'Lifecycle',
    seed: 11,
    referenceTime,
    density: 'empty',
    organization: { ...organization, ageDays: 0 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    generators: { items: 0 },
  },
  {
    id: 'active',
    name: 'Active owner',
    description: 'Two weeks in: a dozen items across to do, doing and done.',
    group: 'Lifecycle',
    seed: 22,
    referenceTime,
    density: 'normal',
    organization: { ...organization, ageDays: 14 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 14 },
    generators: { items: 12 },
  },
  {
    id: 'viewer',
    name: 'Read-only viewer',
    description: 'Same world as “Active owner”, seen by someone who can look but not change.',
    group: 'Roles',
    seed: 22,
    referenceTime,
    density: 'normal',
    organization: { ...organization, ageDays: 14 },
    actor: { id: 'user_0002', role: 'viewer', joinedDaysAgo: 7 },
    generators: { items: 12 },
  },
];
