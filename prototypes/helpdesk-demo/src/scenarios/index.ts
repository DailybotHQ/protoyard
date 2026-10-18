import type { ScenarioDefinition } from '@protoyard/core';

export const scenarios: ScenarioDefinition[] = [
  {
    id: 'empty',
    name: 'Empty',
    description: 'Team only — no projects or tasks yet.',
    seed: 123_001,
    referenceTime: '2026-06-01T09:00:00.000Z',
    density: 'empty',
    organization: { size: 4, ageDays: 30, subscription: 'pro' },
  },
  {
    id: 'active',
    extends: 'workspace-owner',
    name: 'Active',
    description: 'A normal density workspace for day-to-day demos.',
    seed: 123_002,
    referenceTime: '2026-06-01T14:00:00.000Z',
    density: 'normal',
    organization: { size: 6, ageDays: 120, subscription: 'pro' },
  },
  {
    id: 'viewer',
    extends: 'read-only-viewer',
    name: 'Viewer',
    description: 'Read-only stroll through seeded work.',
    seed: 123_003,
    referenceTime: '2026-06-01T11:00:00.000Z',
    density: 'sparse',
    organization: { size: 5, ageDays: 60, subscription: 'pro' },
  },
  {
    id: 'massive',
    extends: 'workspace-owner',
    name: 'Massive',
    description: 'Dense seed for list virtualization and budget checks.',
    seed: 123_004,
    referenceTime: '2026-06-01T16:00:00.000Z',
    density: 'massive',
    organization: { size: 12, ageDays: 365, subscription: 'enterprise' },
  },
];
