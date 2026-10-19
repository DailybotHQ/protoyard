import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-16T09:00:00.000Z';
const base = {
  seed: 8421,
  referenceTime,
  organization: { id: 'org_0001', name: 'Harbor Dispatch', ageDays: 28, size: 4 },
};
export const scenarios: ScenarioInput[] = [
  {
    ...base,
    id: 'active-dispatch',
    name: 'Active dispatch',
    description: 'A busy shift with ready and in-transit fictional shipments.',
    group: 'Lifecycle',
    density: 'normal',
    actor: { id: 'user_0001', role: 'owner' },
    generators: { shipments: 8 },
  },
  {
    ...base,
    id: 'empty',
    name: 'New dispatch desk',
    description: 'A new operation with depots and vehicles but no shipments.',
    group: 'Lifecycle',
    density: 'empty',
    actor: { id: 'user_0001', role: 'owner' },
    generators: { shipments: 0 },
  },
  {
    ...base,
    id: 'network-offline',
    name: 'Network offline',
    description:
      'The dispatcher can review routes, while dispatch actions fail in the simulated offline network.',
    group: 'Conditions',
    density: 'normal',
    actor: { id: 'user_0001', role: 'owner' },
    environment: { network: 'offline' },
    generators: { shipments: 8 },
  },
];
