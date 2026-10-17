import { defineScenario, type ScenarioInput } from '@protoyard/core';

export const REFERENCE_TIME = '2026-10-16T10:00:00-05:00';

export interface ChatGeneratorOptions {
  conversations: number;
  messagesPerConversation: [number, number];
  /** Adds one very long thread (performance / scroll testing). */
  longThread?: number;
  /** Share of a conversation left unread for the actor (0..1). */
  unreadShare?: number;
}

const team = { id: 'org_0001', name: 'Brightpath Studio', subscription: 'pro' } as const;

const activeTeam = defineScenario({
  id: 'active-team',
  name: 'Active team with history',
  description:
    'Six people and three agents, two months of conversations, a few unread threads waiting for you.',
  group: 'Lifecycle',
  seed: 31,
  referenceTime: REFERENCE_TIME,
  organization: { ...team, ageDays: 60, size: 6 },
  actor: { id: 'user_0001', role: 'admin', joinedDaysAgo: 60, onboardingComplete: true },
  density: 'normal',
  activity: { level: 'normal' },
  appearance: { mode: 'dark' },
  generators: { chat: { conversations: 8, messagesPerConversation: [6, 18], unreadShare: 0.25 } },
  tags: ['default'],
});

export const scenarios: ScenarioInput[] = [
  defineScenario({
    id: 'empty-new-user',
    name: 'New user, empty workspace',
    description:
      'Just signed up: no conversations yet. The empty state invites you to ask an agent.',
    group: 'Lifecycle',
    seed: 3,
    referenceTime: REFERENCE_TIME,
    organization: { ...team, ageDays: 0, size: 1, subscription: 'trial' },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0, onboardingComplete: false },
    density: 'empty',
    activity: { level: 'none' },
    generators: { chat: { conversations: 0, messagesPerConversation: [0, 0] } },
  }),
  activeTeam,
  defineScenario({
    ...activeTeam,
    id: 'member-view',
    name: 'Member',
    description:
      'A member can chat and invoke agents but can only manage conversations they created.',
    group: 'Roles',
    actor: { id: 'user_0002', role: 'member', joinedDaysAgo: 40, onboardingComplete: true },
  }),
  defineScenario({
    ...activeTeam,
    id: 'viewer-view',
    name: 'Read-only guest',
    description: 'An external guest who can read history but cannot post or invoke agents.',
    group: 'Roles',
    actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 5, onboardingComplete: true },
  }),
  defineScenario({
    ...activeTeam,
    id: 'agent-outage',
    name: 'Agent outage',
    description:
      'Chat works, but every agent request fails with a simulated 500 — check failed-reply and retry UX.',
    group: 'Conditions',
    environment: { failureMode: 'server-error', failureRate: 1, failureScope: ['agents.'] },
  }),
  defineScenario({
    ...activeTeam,
    id: 'long-thread',
    name: 'Very long conversation',
    description: 'One thread with 600 messages for scroll, search and rendering performance.',
    group: 'Data density',
    density: 'dense',
    generators: {
      chat: {
        conversations: 4,
        messagesPerConversation: [4, 10],
        longThread: 600,
        unreadShare: 0.1,
      },
    },
  }),
];
