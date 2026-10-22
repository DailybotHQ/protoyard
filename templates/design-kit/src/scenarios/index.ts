import type { ScenarioInput } from '@protoyard/core';

export const scenarios: ScenarioInput[] = [
  {
    id: 'default',
    name: 'Design review',
    description: 'A fresh kit ready for component review.',
    group: 'Workspace',
    seed: 42,
    referenceTime: '2026-10-20T12:00:00.000Z',
    density: 'normal',
    organization: { id: 'org_0001', name: 'Studio North', ageDays: 30, size: 2 },
    actor: { id: 'user_0001', role: 'designer', joinedDaysAgo: 30 },
  },
  {
    id: 'reviewer',
    name: 'Read-only reviewer',
    description: 'Browse the catalog as a stakeholder without review-write access.',
    group: 'Roles',
    seed: 42,
    referenceTime: '2026-10-20T12:00:00.000Z',
    density: 'normal',
    organization: { id: 'org_0001', name: 'Studio North', ageDays: 30, size: 2 },
    actor: { id: 'user_0002', role: 'viewer', joinedDaysAgo: 12 },
  },
];
