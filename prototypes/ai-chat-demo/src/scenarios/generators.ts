import {
  type GenerateContext,
  type Membership,
  MS_PER_MINUTE,
  type Organization,
  type Persona,
  type Row,
  type WorldSeed,
} from '@protoyard/core';
import type { Conversation, Message, Participant } from '../database/schema.ts';
import { AGENTS, scriptedReply } from '../domain/agents.ts';
import type { ChatGeneratorOptions } from './index.ts';

/** Bump when generated output for the same seed changes. */
export const CHAT_GENERATOR_VERSION = 1;

const PEOPLE = [
  { id: 'user_0001', name: 'Alex Rivera', title: 'Design lead', role: 'owner', color: '#0ea5e9' },
  {
    id: 'user_0002',
    name: 'Priya Shah',
    title: 'Product manager',
    role: 'member',
    color: '#db2777',
  },
  { id: 'user_0003', name: 'Morgan Lee', title: 'Engineer', role: 'member', color: '#16a34a' },
  {
    id: 'user_0004',
    name: 'Kai Tanaka',
    title: 'Agency partner',
    role: 'viewer',
    color: '#f59e0b',
  },
  { id: 'user_0005', name: 'Sofia Romero', title: 'Engineer', role: 'member', color: '#8b5cf6' },
  { id: 'user_0006', name: 'Noah Bennett', title: 'Support lead', role: 'admin', color: '#ef4444' },
] as const;

const TITLES = [
  'Launch planning',
  'Design critique',
  'Incident review',
  'Release notes',
  'Customer feedback',
  'Weekly sync',
  'Pricing experiment',
  'Onboarding revamp',
  'Hiring loop',
  'Roadmap Q4',
];

const HUMAN_LINES = [
  'Can someone take a look at the latest mockups?',
  'Shipping the fix today, will post once it is live.',
  '@atlas summarize the thread for me',
  '@quill draft release notes for the search update',
  '@beacon what is the status of webhooks?',
  'Agreed — let us keep the scope small for v1.',
  'I added the numbers to the doc.',
  'Customers keep asking for saved filters.',
  'Compare option A vs option B for the pricing page',
  'Thanks! That helps a lot.',
];

export function generateChatWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, rng, ids, time } = ctx;
  const opts = (scenario.generators.chat ?? {
    conversations: 6,
    messagesPerConversation: [4, 12],
  }) as ChatGeneratorOptions;
  const iso = (d: Date) => d.toISOString();
  const now = time.now;
  const ageDays = scenario.organization.ageDays;
  const created = time.daysAgo(ageDays);

  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Brightpath Studio',
    type: 'company',
    plan: scenario.organization.subscription,
    billingStatus: 'active',
    createdAt: iso(created),
    size: scenario.organization.size,
    featureFlags: { agents: true, ...scenario.organization.featureFlags },
  };

  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  PEOPLE.forEach((person, index) => {
    if (index >= scenario.organization.size && person.id !== scenario.actor.id) return;
    const isActor = person.id === scenario.actor.id;
    const joined = isActor
      ? time.daysAgo(Math.min(scenario.actor.joinedDaysAgo, ageDays))
      : time.daysAgo(Math.max(0, ageDays - index * 3));
    personas.push({
      id: person.id,
      name: person.name,
      email: `${person.name.split(' ')[0]?.toLowerCase()}@brightpath.example`,
      avatarColor: person.color,
      title: person.title,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt: iso(joined),
      onboardingComplete: isActor ? scenario.actor.onboardingComplete : true,
      preferences: {},
      summary: person.title,
    });
    memberships.push({
      id: `member_${person.id}`,
      personaId: person.id,
      organizationId: organization.id,
      role: isActor ? scenario.actor.role : person.role,
      joinedAt: iso(joined),
      capabilities: [],
    });
  });
  const joinedAt = new Map(personas.map((p) => [p.id, Date.parse(p.joinedAt)]));

  const conversations: Conversation[] = [];
  const participants: Participant[] = [];
  const messages: Message[] = [];
  const actorId = scenario.actor.id;

  const total = opts.conversations + (opts.longThread ? 1 : 0);
  for (let c = 0; c < total; c++) {
    const isLong = opts.longThread !== undefined && c === total - 1;
    const agents = rng.sample(AGENTS, rng.int(1, 2));
    const people = personas.filter((p) => p.id === actorId || rng.chance(0.6));
    const start = new Date(
      Math.max(created.getTime(), now.getTime() - rng.int(1, Math.max(1, ageDays)) * 86_400_000)
    );
    const conversation: Conversation = {
      id: ids.next('conv'),
      title: isLong ? 'All-hands archive' : (TITLES[c % TITLES.length] ?? 'Conversation'),
      kind: 'channel',
      createdBy: rng.pick(people).id,
      createdAt: iso(start),
      lastMessageAt: iso(start),
      pinned: c === 0,
      archived: false,
    };
    conversations.push(conversation);

    const count = isLong
      ? (opts.longThread ?? 0)
      : rng.int(opts.messagesPerConversation[0], opts.messagesPerConversation[1]);
    const span = now.getTime() - start.getTime();
    const step = count > 0 ? span / (count + 1) : 0;
    let at = start.getTime();
    for (let m = 0; m < count; m++) {
      at = Math.min(
        now.getTime() - MS_PER_MINUTE,
        at + Math.max(MS_PER_MINUTE, step * rng.float(0.4, 1.6))
      );
      const author = rng.pick(people);
      if (at < (joinedAt.get(author.id) ?? 0)) continue;
      const line = rng.pick(HUMAN_LINES);
      const prompt: Message = {
        id: ids.next('msg'),
        conversationId: conversation.id,
        authorId: author.id,
        authorKind: 'person',
        body: line,
        at: iso(new Date(at)),
        status: 'sent',
        runId: null,
      };
      messages.push(prompt);
      const mentioned = agents.find((a) => line.includes(`@${a.handle}`));
      if (mentioned) {
        at += 20_000;
        messages.push({
          id: ids.next('msg'),
          conversationId: conversation.id,
          authorId: mentioned.id,
          authorKind: 'agent',
          body: scriptedReply(mentioned, line),
          at: iso(new Date(Math.min(at, now.getTime()))),
          status: 'sent',
          runId: null,
        });
      }
    }
    const convMessages = messages.filter((m) => m.conversationId === conversation.id);
    const last = convMessages.at(-1);
    if (last) conversation.lastMessageAt = last.at;

    // The actor has read everything except the newest share of some threads.
    const unreadFrom = rng.chance(opts.unreadShare ?? 0)
      ? convMessages[Math.floor(convMessages.length * 0.7)]
      : undefined;
    const lastRead = unreadFrom
      ? new Date(Date.parse(unreadFrom.at) - 1000)
      : new Date(Date.parse(conversation.lastMessageAt));
    for (const person of people) {
      participants.push({
        id: ids.next('part'),
        conversationId: conversation.id,
        memberId: person.id,
        memberKind: 'person',
        lastReadAt: iso(
          person.id === actorId ? lastRead : new Date(Date.parse(conversation.lastMessageAt))
        ),
      });
    }
    for (const agent of agents) {
      participants.push({
        id: ids.next('part'),
        conversationId: conversation.id,
        memberId: agent.id,
        memberKind: 'agent',
        lastReadAt: conversation.lastMessageAt,
      });
    }
  }

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      agents: AGENTS as unknown as Row[],
      conversations: conversations as unknown as Row[],
      participants: participants as unknown as Row[],
      messages: messages as unknown as Row[],
      runs: [],
    },
  };
}
