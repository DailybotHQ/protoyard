import { generateAiScenario } from '@protoyard/ai/scenarios';
import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';
import type { Conversation, Message, Project, WorkspaceSettings } from '../database/schema.ts';

const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Avery Stone',
    role: 'owner',
    title: 'Workspace owner',
    color: '#7865d6',
  },
  {
    id: 'user_0002',
    name: 'Jordan Lee',
    role: 'member',
    title: 'Product designer',
    color: '#c46c8d',
  },
  { id: 'user_0003', name: 'Sam Rivera', role: 'viewer', title: 'Guest', color: '#397f83' },
] as const;
const PROJECTS = [
  { name: 'Product studio', color: '#8771e8' },
  { name: 'Research', color: '#4f9a91' },
  { name: 'Personal', color: '#d28a5b' },
] as const;

export function generateAssistantWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, rng, ids, time } = ctx;
  const age = scenario.organization.ageDays;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Orbit Studio',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(age)),
    size: PEOPLE.length,
    featureFlags: {},
  };
  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('nova-assistant-demo:avatars:people'));
  const personas: Persona[] = PEOPLE.map((person, index) => {
    const joinedDays = Math.max(0, age - index * 8);
    return {
      id: person.id,
      name: person.name,
      avatar: faces.next(),
      email: `${person.name.split(' ')[0]?.toLowerCase()}@example.com`,
      title: person.title,
      avatarColor: person.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt: time.iso(time.daysAgo(joinedDays)),
      onboardingComplete: true,
      preferences: {},
      summary: person.title,
    };
  });
  const memberships: Membership[] = PEOPLE.map((person, index) => ({
    id: `membership_${String(index + 1).padStart(4, '0')}`,
    personaId: person.id,
    organizationId: organization.id,
    role: person.role,
    joinedAt: time.iso(time.daysAgo(Math.max(0, age - index * 8))),
    capabilities: [],
  }));

  const workspace = generateAiScenario(ctx, {
    history: {
      conversations: Number(scenario.generators.conversations ?? 4),
      messagesPerConversation: Number(scenario.generators.messagesPerConversation ?? 8),
    },
    agent: { approvalCalls: Number(scenario.generators.approvals ?? 0), toolCalls: 1 },
    maxRequestsPerMinute: Number(scenario.generators.maxRequestsPerMinute ?? 30),
  });
  const projects: Project[] = PROJECTS.map((project) => ({
    id: ids.next('project'),
    ...project,
    createdAt: time.iso(time.daysAgo(Math.min(age, rng.int(0, age)))),
  }));
  const conversations: Conversation[] = workspace.workspace.conversations.map(
    (conversation, index) => ({
      ...conversation,
      projectId: projects[index % projects.length]?.id ?? 'project_default',
      pinned: index === 0,
      folder: index % 3 === 0 ? 'Ideas' : undefined,
      modelId: workspace.workspace.modelId,
    })
  );
  const messages: Message[] = workspace.workspace.conversations.flatMap((conversation) =>
    conversation.messages.map((message) => ({
      ...message,
      conversationId: conversation.id,
      ...(message.role === 'assistant'
        ? {
            model: workspace.workspace.modelId,
            usage: {
              promptTokens: Math.ceil(message.content.length / 4),
              completionTokens: Math.ceil(message.content.length / 4),
              totalTokens: Math.ceil(message.content.length / 2),
              costUsd: 0.00002,
            },
          }
        : {}),
    }))
  );
  const settings: WorkspaceSettings = {
    id: 'workspace',
    customInstructions: 'Keep answers practical, clear, and easy to review.',
    memory: 'The team is preparing a thoughtful product launch.',
    memoryEnabled: true,
    dataControls: 'standard',
    monthlyLimit: 1_000_000,
    maxRequestsPerMinute: workspace.environment.maxRequestsPerMinute,
    agentApprovalRequired: workspace.agent.calls.some((call) => call.requiresApproval),
    canvas: null,
    folders: ['Ideas', 'Launch'],
    updatedAt: time.iso(time.daysAgo(0)),
  };

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      projects: projects as unknown as ({ id: string } & Record<string, unknown>)[],
      conversations: conversations as unknown as ({ id: string } & Record<string, unknown>)[],
      messages: messages as unknown as ({ id: string } & Record<string, unknown>)[],
      settings: [settings] as unknown as ({ id: string } & Record<string, unknown>)[],
    },
  };
}
