import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';
import {
  type Conversation,
  type Message,
  type ReadMarker,
  readMarkerId,
  SUPPORT_THREAD_ID,
} from '../database/schema.ts';
import { ASSISTANT, GREETING, scriptedReply } from '../domain/assistant.ts';

/**
 * Deterministic world: one support thread per visitor. Never Math.random() or Date.now().
 */

const VISITOR = {
  id: 'user_visitor',
  name: 'Alex Visitor',
  title: 'Customer',
  role: 'visitor',
  color: '#0369a1',
} as const;

const AGENT = {
  id: 'user_agent',
  name: 'Casey Support',
  title: 'Support agent',
  role: 'agent',
  color: '#0f766e',
} as const;

const PEOPLE = [VISITOR, AGENT] as const;

const PROMPTS = ['Where is my order?', 'How do I start a return?', 'Do you ship internationally?'];

function identities(
  ctx: GenerateContext
): Pick<WorldSeed, 'organizations' | 'personas' | 'memberships'> {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Support',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(ageDays)),
    size: PEOPLE.length,
    featureFlags: {},
  };
  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('chat-widget:avatars:people'));
  const personas: Persona[] = PEOPLE.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: faces.next(),
    email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
    title: p.title,
    avatarColor: p.color,
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: time.iso(time.daysAgo(Math.max(0, ageDays - i))),
    onboardingComplete: true,
    preferences: {},
    summary: p.title,
  }));
  const memberships: Membership[] = PEOPLE.map((p, i) => ({
    id: `membership_${String(i + 1).padStart(4, '0')}`,
    personaId: p.id,
    organizationId: organization.id,
    role: p.role,
    joinedAt: time.iso(time.daysAgo(Math.max(0, ageDays - i))),
    capabilities: [],
  }));
  return { organizations: [organization], personas, memberships };
}

export function generateChatWorld(ctx: GenerateContext): WorldSeed {
  const world = identities(ctx);
  const { rng, ids, time, scenario } = ctx;
  const history = Math.max(0, Math.min(6, Number(scenario.generators.history ?? 0)));

  const ageDays = Math.max(0, scenario.organization.ageDays);
  const start = ageDays <= 0 ? time.daysAgo(0) : time.daysAgo(rng.int(0, ageDays), rng.int(0, 4));
  const conversation: Conversation = {
    id: SUPPORT_THREAD_ID,
    title: 'Support',
    createdBy: VISITOR.id,
    createdAt: time.iso(start),
    lastMessageAt: time.iso(start),
    handoffRequested: false,
    handoffJoined: false,
  };

  const messages: Message[] = [];
  let at = start.getTime();

  // Opening greeting from the bot on every world.
  messages.push({
    id: ids.next('msg'),
    conversationId: conversation.id,
    authorId: ASSISTANT.id,
    authorKind: 'assistant',
    body: GREETING,
    at: time.iso(new Date(at)),
    status: 'sent',
    promptId: null,
    error: null,
  });

  for (let i = 0; i < history; i++) {
    at += rng.int(15, 180) * 60_000;
    const promptBody = rng.pick(PROMPTS);
    const prompt: Message = {
      id: ids.next('msg'),
      conversationId: conversation.id,
      authorId: VISITOR.id,
      authorKind: 'person',
      body: promptBody,
      at: time.iso(new Date(at)),
      status: 'sent',
      promptId: null,
      error: null,
    };
    at += 45_000;
    messages.push(prompt, {
      id: ids.next('msg'),
      conversationId: conversation.id,
      authorId: ASSISTANT.id,
      authorKind: 'assistant',
      body: scriptedReply(promptBody),
      at: time.iso(new Date(at)),
      status: 'sent',
      promptId: prompt.id,
      error: null,
    });
  }

  conversation.lastMessageAt = time.iso(new Date(at));

  const reads: ReadMarker[] = PEOPLE.map((person) => ({
    id: readMarkerId(conversation.id, person.id),
    conversationId: conversation.id,
    personaId: person.id,
    lastReadAt: time.iso(new Date(at)),
  }));

  return {
    ...world,
    tables: { conversations: [conversation], messages, reads },
  };
}
