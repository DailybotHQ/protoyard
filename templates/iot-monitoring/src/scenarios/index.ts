import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-19T13:00:00.000Z';
const organization = { id: 'org_0001', name: 'Northstar Field Systems', ageDays: 120, size: 4 };
const base = { seed: 7241, referenceTime, organization };

export const scenarios: ScenarioInput[] = [
  {
    ...base,
    id: 'active',
    name: 'Field operations',
    description: 'A live fleet with recent telemetry, threshold alerts and an active incident.',
    group: 'Lifecycle',
    density: 'normal',
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 90 },
    generators: { monitoring: { devices: 12, historyDays: 14 } },
    tags: ['default'],
  },
  {
    ...base,
    id: 'quiet',
    name: 'Steady operations',
    description: 'A calm site with devices inside their operating thresholds.',
    group: 'Lifecycle',
    density: 'normal',
    actor: { id: 'user_0002', role: 'operator', joinedDaysAgo: 70 },
    generators: { monitoring: { devices: 8, historyDays: 14, quiet: true } },
  },
  {
    ...base,
    id: 'storm',
    name: 'Storm response',
    description: 'A weather event creates critical readings across several devices.',
    group: 'Conditions',
    density: 'dense',
    actor: { id: 'user_0002', role: 'operator', joinedDaysAgo: 70 },
    generators: { monitoring: { devices: 24, historyDays: 14, storm: true } },
  },
  {
    ...base,
    id: 'network-offline',
    name: 'Offline field team',
    description: 'The fleet remains readable while alert acknowledgements fail offline.',
    group: 'Conditions',
    density: 'normal',
    actor: { id: 'user_0002', role: 'operator', joinedDaysAgo: 70 },
    environment: { network: 'offline' },
    generators: { monitoring: { devices: 12, historyDays: 14 } },
  },
  {
    ...base,
    id: 'massive',
    name: 'Large sensor network',
    description: 'A thousand devices for testing map and scenario generation at scale.',
    group: 'Scale',
    density: 'massive',
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 90 },
    generators: { monitoring: { devices: 1000, historyDays: 7 } },
  },
];
