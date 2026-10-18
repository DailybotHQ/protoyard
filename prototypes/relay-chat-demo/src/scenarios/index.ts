import type { ScenarioDefinition } from '@protoyard/core';

export const scenarios: ScenarioDefinition[] = [
  {
    id: 'empty',
    name: 'Empty workspace',
    description: 'One workspace, #general only, no history.',
    seed: 104_001,
    referenceTime: '2026-06-01T09:00:00.000Z',
    organization: { size: 4, ageDays: 14 },
  },
  {
    id: 'busy-day',
    extends: 'workspace-owner',
    name: 'Busy day',
    description: 'Channels, DMs, threads, reactions and presence mid-sprint.',
    seed: 104_002,
    referenceTime: '2026-06-01T15:30:00.000Z',
    organization: { size: 8, ageDays: 120 },
  },
  {
    id: 'quiet-night',
    extends: 'six-month-new-member',
    name: 'Quiet night',
    description: 'Member persona, lighter traffic, bots idle.',
    seed: 104_003,
    referenceTime: '2026-06-01T22:00:00.000Z',
    organization: { size: 6, ageDays: 60 },
  },
  {
    id: 'viewer',
    extends: 'read-only-viewer',
    name: 'Viewer',
    description: 'Read-only stroll through the workspace.',
    seed: 104_004,
    referenceTime: '2026-06-01T11:00:00.000Z',
    organization: { size: 5, ageDays: 90 },
  },
];
