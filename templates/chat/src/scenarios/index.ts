import type { ScenarioInput } from '@protoyard/core';

/**
 * Scenarios are versioned, seeded worlds. Add one by appending an entry here
 * AND listing its id in protoyard.json → "scenarios". `generators.conversations`
 * is a template-specific knob read by `generators.ts`.
 */

const referenceTime = '2026-10-16T15:00:00.000Z';
const organization = { id: 'org_0001', name: 'Northwind Team', size: 3 } as const;

const active: ScenarioInput = {
  id: 'active',
  name: 'Active team',
  description: 'Three weeks of conversations with the assistant, a couple of them unread.',
  group: 'Lifecycle',
  seed: 42,
  referenceTime,
  density: 'normal',
  organization: { ...organization, ageDays: 21 },
  actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 21 },
  generators: { conversations: 5 },
};

export const scenarios: ScenarioInput[] = [
  {
    id: 'empty',
    name: 'First visit',
    description: 'The owner just arrived: no conversations yet. Shows the empty state.',
    group: 'Lifecycle',
    seed: 7,
    referenceTime,
    density: 'empty',
    organization: { ...organization, ageDays: 0 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    generators: { conversations: 0 },
  },
  active,
  {
    ...active,
    id: 'viewer',
    name: 'Read-only viewer',
    description: 'Same world as “Active team”, seen by someone who can read but not post.',
    group: 'Roles',
    actor: { id: 'user_0003', role: 'viewer', joinedDaysAgo: 7 },
  },
  {
    ...active,
    id: 'assistant-outage',
    name: 'Assistant outage',
    description:
      'Chat works, but every assistant reply fails with a simulated 500. Check the failed-reply and retry UX.',
    group: 'Conditions',
    environment: { failureMode: 'server-error', failureRate: 1, failureScope: ['assistant.'] },
  },
];
