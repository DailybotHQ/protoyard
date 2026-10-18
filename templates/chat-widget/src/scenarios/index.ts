import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-16T15:00:00.000Z';
const organization = { id: 'org_0001', name: 'Northwind Support', size: 2 } as const;

/**
 * Widget scenarios. Each id must also appear in protoyard.json → "scenarios".
 */
export const scenarios: ScenarioInput[] = [
  {
    id: 'first-visit',
    name: 'First visit',
    description: 'Empty support thread with a greeting. The visitor can post and hand off.',
    group: 'Lifecycle',
    seed: 11,
    referenceTime,
    density: 'empty',
    organization: { ...organization, ageDays: 0 },
    actor: { id: 'user_visitor', role: 'visitor', joinedDaysAgo: 0 },
    generators: { history: 0 },
  },
  {
    id: 'returning-visitor',
    name: 'Returning visitor',
    description: 'Prior messages already in the support thread from an earlier session.',
    group: 'Lifecycle',
    seed: 42,
    referenceTime,
    density: 'normal',
    organization: { ...organization, ageDays: 14 },
    actor: { id: 'user_visitor', role: 'visitor', joinedDaysAgo: 14 },
    generators: { history: 3 },
  },
  {
    id: 'agent-offline',
    name: 'Visitor offline',
    description: 'Network is offline — the offline banner shows and sends fail (simulated).',
    group: 'Conditions',
    seed: 42,
    referenceTime,
    density: 'normal',
    organization: { ...organization, ageDays: 14 },
    actor: { id: 'user_visitor', role: 'visitor', joinedDaysAgo: 14 },
    generators: { history: 2 },
    environment: { network: 'offline' },
  },
  {
    id: 'outage',
    name: 'Assistant outage',
    description:
      'Assistant replies fail with a simulated 500. Retry recovers after clearing the failure override.',
    group: 'Conditions',
    seed: 42,
    referenceTime,
    density: 'normal',
    organization: { ...organization, ageDays: 7 },
    actor: { id: 'user_visitor', role: 'visitor', joinedDaysAgo: 7 },
    generators: { history: 1 },
    environment: { failureMode: 'server-error', failureRate: 1, failureScope: ['assistant.'] },
  },
];
