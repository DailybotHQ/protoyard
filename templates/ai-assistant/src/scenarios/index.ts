import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-16T15:00:00.000Z';
const organization = { id: 'org_0001', name: 'Orbit Studio', size: 3 } as const;
const base: ScenarioInput = {
  id: 'active-workspace',
  name: 'Active workspace',
  description: 'A small team with project folders, saved conversations and a ready-to-use canvas.',
  group: 'Workspace',
  seed: 734,
  referenceTime,
  density: 'normal',
  organization: { ...organization, ageDays: 45 },
  actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 45 },
  generators: { conversations: 4, messagesPerConversation: 8, approvals: 0 },
};

export const scenarios: ScenarioInput[] = [
  {
    ...base,
    id: 'fresh-workspace',
    name: 'Fresh workspace',
    description: 'A first-visit workspace with no history.',
    group: 'Workspace',
    seed: 17,
    density: 'empty',
    organization: { ...organization, ageDays: 0 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    generators: { conversations: 0, messagesPerConversation: 0, approvals: 0 },
  },
  base,
  {
    ...base,
    id: 'power-user',
    name: 'Power user',
    description: 'A workspace with a wider project history and long conversations.',
    group: 'Workspace',
    seed: 155,
    generators: { conversations: 6, messagesPerConversation: 18, approvals: 0 },
  },
  {
    ...base,
    id: 'slow-model',
    name: 'Slow model',
    description: 'Responses have simulated latency so loading and stop states can be explored.',
    group: 'Conditions',
    environment: { latencyMs: 900 },
  },
  {
    ...base,
    id: 'rate-limited',
    name: 'Rate limited',
    description: 'The simulated model accepts two requests per minute.',
    group: 'Conditions',
    seed: 244,
    generators: {
      conversations: 2,
      messagesPerConversation: 4,
      approvals: 0,
      maxRequestsPerMinute: 2,
    },
  },
  {
    ...base,
    id: 'assistant-outage',
    name: 'Assistant outage',
    description: 'The simulated assistant is unavailable until the environment changes.',
    group: 'Conditions',
    environment: { failureMode: 'server-error', failureRate: 1, failureScope: ['ai.generate'] },
  },
  {
    ...base,
    id: 'agent-approval',
    name: 'Agent approval',
    description: 'An agent plan includes a tool action that asks for simulated approval.',
    group: 'Agents',
    seed: 621,
    generators: { conversations: 2, messagesPerConversation: 4, approvals: 1 },
  },
];
