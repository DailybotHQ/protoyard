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
} from '../database/schema.ts';
import { ASSISTANT, scriptedReply } from '../domain/assistant.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` (seeded)
 * and every date from `ctx.time` (anchored at the scenario reference time), so
 * the same scenario renders the same world on every machine. Never use
 * Math.random() or Date.now() here. Bump `generatorVersion` in prototype.ts
 * when the same seed starts producing different data.
 */

// Fixed people so links like `?actor=user_0002` keep meaning the same person.
const PEOPLE = [
  { id: 'user_0001', name: 'Avery Stone', title: 'Team lead', role: 'owner', color: '#0369a1' },
  { id: 'user_0002', name: 'Jordan Lee', title: 'Designer', role: 'member', color: '#be185d' },
  { id: 'user_0003', name: 'Sam Rivera', title: 'Guest', role: 'viewer', color: '#b45309' },
] as const;

const TITLES = [
  'Weekly planning',
  'Product ideas',
  'Customer questions',
  'Launch checklist',
  'Retro notes',
  'Hiring',
];

const PROMPTS = [
  'Can you summarize where we landed?',
  'Any ideas for the onboarding email?',
  'How should we prioritize the backlog?',
  'I pushed the new draft, take a look.',
  'Brainstorm three names for the beta.',
  'Thanks, that helps.',
];

function identities(
  ctx: GenerateContext
): Pick<WorldSeed, 'organizations' | 'personas' | 'memberships'> {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Team',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(ageDays)),
    size: PEOPLE.length,
    featureFlags: {},
  };
  const joined = (i: number) => Math.max(0, ageDays - i * 7);
  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('chat:avatars:people'));
  const personas: Persona[] = PEOPLE.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: faces.next(),
    email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
    title: p.title,
    avatarColor: p.color,
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: time.iso(time.daysAgo(joined(i))),
    onboardingComplete: true,
    preferences: {},
    summary: `${p.title}, joined ${joined(i) === 0 ? 'today' : `${joined(i)} days ago`}`,
  }));
  const memberships: Membership[] = PEOPLE.map((p, i) => ({
    id: `membership_${String(i + 1).padStart(4, '0')}`,
    personaId: p.id,
    organizationId: organization.id,
    role: p.role,
    joinedAt: time.iso(time.daysAgo(joined(i))),
    capabilities: [],
  }));
  return { organizations: [organization], personas, memberships };
}

export function generateChatWorld(ctx: GenerateContext): WorldSeed {
  const world = identities(ctx);
  const { rng, ids, time, scenario } = ctx;
  const requested = Number(scenario.generators.conversations ?? ctx.scale(5));
  const count = Math.max(0, Math.min(TITLES.length, Number.isFinite(requested) ? requested : 0));
  const ageDays = Math.max(1, scenario.organization.ageDays);
  // Only people who can post author messages (owner and member).
  const authors = PEOPLE.filter((p) => p.role !== 'viewer');
  const actorId = scenario.actor.id;

  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const reads: ReadMarker[] = [];

  for (let c = 0; c < count; c++) {
    const start = time.daysAgo(rng.int(1, ageDays), rng.int(0, 6));
    const conversation: Conversation = {
      id: ids.next('conv'),
      title: TITLES[c] ?? `Conversation ${c + 1}`,
      createdBy: rng.pick(authors).id,
      createdAt: time.iso(start),
      lastMessageAt: time.iso(start),
    };
    let at = start.getTime();
    const exchanges = rng.int(2, 5);
    for (let m = 0; m < exchanges; m++) {
      // Starts >= 1 day ago and at most 5 × 4h later, so it never passes the reference time.
      at += rng.int(10, 240) * 60_000;
      const prompt: Message = {
        id: ids.next('msg'),
        conversationId: conversation.id,
        authorId: rng.pick(authors).id,
        authorKind: 'person',
        body: rng.pick(PROMPTS),
        at: time.iso(new Date(at)),
        status: 'sent',
        promptId: null,
        error: null,
      };
      at += 30_000;
      messages.push(prompt, {
        id: ids.next('msg'),
        conversationId: conversation.id,
        authorId: ASSISTANT.id,
        authorKind: 'assistant',
        body: scriptedReply(prompt.body),
        at: time.iso(new Date(at)),
        status: 'sent',
        promptId: prompt.id,
        error: null,
      });
    }
    conversation.lastMessageAt = time.iso(new Date(at));
    conversations.push(conversation);

    // Everyone has read everything, except the actor in some threads.
    const own = messages.filter((m) => m.conversationId === conversation.id);
    for (const person of PEOPLE) {
      const leaveUnread = person.id === actorId && rng.chance(0.4) && own.length >= 2;
      const lastRead = leaveUnread
        ? new Date(Date.parse(own[own.length - 2]?.at ?? conversation.createdAt) - 1000)
        : new Date(at);
      reads.push({
        id: readMarkerId(conversation.id, person.id),
        conversationId: conversation.id,
        personaId: person.id,
        lastReadAt: time.iso(lastRead),
      });
    }
  }

  return { ...world, tables: { conversations, messages, reads } };
}
