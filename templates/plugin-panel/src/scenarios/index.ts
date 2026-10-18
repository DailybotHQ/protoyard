import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-16T10:00:00.000Z';
const organization = { id: 'org_0001', name: 'Orbit Studio', ageDays: 32, size: 3 };
const base: ScenarioInput = {
  id: 'connected-workspace',
  name: 'Connected workspace',
  description: 'A small team with two integrations connected and automatic sync enabled.',
  group: 'Workspace',
  seed: 41,
  referenceTime,
  organization,
  actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 32 },
};

export const scenarios: ScenarioInput[] = [
  {
    ...base,
    id: 'empty',
    name: 'Fresh panel',
    description: 'No connected items yet; start with the simulated account connection flow.',
    group: 'Workspace',
    seed: 11,
    organization: { ...organization, ageDays: 0, name: 'New workspace' },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    tags: ['default'],
  },
  base,
  {
    ...base,
    id: 'sync-paused',
    name: 'Sync paused',
    description: 'Connected items are present, but automatic sync is paused in settings.',
    group: 'Conditions',
    seed: 58,
  },
  {
    ...base,
    id: 'connect-error',
    name: 'Connection outage',
    description: 'The simulated connection service fails until environment failures are cleared.',
    group: 'Conditions',
    environment: {
      failureMode: 'server-error',
      failureRate: 1,
      failureScope: ['integrations.connect'],
    },
  },
  {
    ...base,
    id: 'read-only',
    name: 'Read-only teammate',
    description: 'A viewer can review connections and settings but cannot change them.',
    group: 'Workspace',
    seed: 77,
    actor: { id: 'user_0003', role: 'viewer', joinedDaysAgo: 12 },
  },
];
