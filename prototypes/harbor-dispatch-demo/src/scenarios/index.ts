import type { ScenarioDefinition } from '@protoyard/core';

export const scenarios: ScenarioDefinition[] = [
  {
    id: 'empty',
    name: 'New fleet',
    description: 'A Harborlight team waiting for its first shipment.',
    seed: 123_001,
    referenceTime: '2026-06-01T09:00:00.000Z',
    density: 'empty',
    organization: { name: 'Harborlight Logistics', size: 4, ageDays: 30, subscription: 'pro' },
  },
  {
    id: 'active',
    extends: 'workspace-owner',
    name: 'Active dispatch',
    description: 'A regular day of shipments moving through the fictional harbor.',
    seed: 123_002,
    referenceTime: '2026-06-01T14:00:00.000Z',
    density: 'normal',
    organization: { name: 'Harborlight Logistics', size: 6, ageDays: 120, subscription: 'pro' },
  },
  {
    id: 'viewer',
    extends: 'read-only-viewer',
    name: 'Dispatch viewer',
    description: 'A read-only look at the delivery board and harbor map.',
    seed: 123_003,
    referenceTime: '2026-06-01T11:00:00.000Z',
    density: 'sparse',
    organization: { name: 'Harborlight Logistics', size: 5, ageDays: 60, subscription: 'pro' },
  },
  {
    id: 'massive',
    extends: 'workspace-owner',
    name: 'Fleet scale',
    description: 'A dense Harborlight sample for checking large shipment lists.',
    seed: 123_004,
    referenceTime: '2026-06-01T16:00:00.000Z',
    density: 'massive',
    organization: {
      name: 'Harborlight Logistics',
      size: 12,
      ageDays: 365,
      subscription: 'enterprise',
    },
  },
];
