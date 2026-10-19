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
  type Order,
  type ReadMarker,
  type ReturnRequest,
  readMarkerId,
  SUPPORT_THREAD_ID,
} from '../database/schema.ts';
import { ASSISTANT, GREETING, scriptedReply } from '../domain/assistant.ts';

const VISITOR = {
  id: 'user_visitor',
  name: 'Alex Trail',
  title: 'Customer',
  role: 'visitor',
  color: '#0369a1',
  email: 'alex.trail@example.com',
} as const;

const AGENT = {
  id: 'user_agent',
  name: 'Casey Support',
  title: 'Support agent',
  role: 'agent',
  color: '#0f766e',
  email: 'casey.support@example.com',
} as const;

const PEOPLE = [VISITOR, AGENT] as const;

const CATALOG = [
  { summary: 'Cascade 40L pack', cents: 18_900 },
  { summary: 'Ridge shell jacket', cents: 14_900 },
  { summary: 'Trail mug (steel)', cents: 2_800 },
  { summary: 'Summit poles (pair)', cents: 8_500 },
] as const;

const PROMPTS = ['Where is my order?', 'How do I start a return?', 'Do you ship to Canada?'];

function identities(
  ctx: GenerateContext
): Pick<WorldSeed, 'organizations' | 'personas' | 'memberships'> {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Outfitters',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(ageDays)),
    size: PEOPLE.length,
    featureFlags: {},
  };
  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('support-widget-demo:avatars:people'));
  const personas: Persona[] = PEOPLE.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: faces.next(),
    email: p.email,
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
  const orderCount = Math.max(0, Math.min(6, Number(scenario.generators.orders ?? 3)));
  const openReturn = Number(scenario.generators.openReturn ?? 0) > 0;

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

  const orders: Order[] = [];
  const statuses: Order['status'][] = ['delivered', 'shipped', 'processing', 'delivered'];
  const orgCreatedMs = Date.parse(world.organizations[0]!.createdAt);
  const refMs = Date.parse(scenario.referenceTime);
  for (let i = 0; i < orderCount; i++) {
    const item = CATALOG[i % CATALOG.length]!;
    // orderedAt must be >= organization.createdAt and <= referenceTime.
    const span = Math.max(0, refMs - orgCreatedMs);
    const orderedMs = orgCreatedMs + Math.floor(rng.next() * span);
    const ordered = new Date(orderedMs);
    const status = statuses[i % statuses.length]!;
    const shipMs = Math.min(refMs, orderedMs + rng.int(1, 3) * 86_400_000);
    const shipped =
      status === 'processing' || status === 'cancelled' ? null : time.iso(new Date(shipMs));
    orders.push({
      id: ids.next('ord'),
      number: `NW-${10040 + i}`,
      email: VISITOR.email,
      status,
      totalCents: item.cents,
      itemSummary: item.summary,
      orderedAt: time.iso(ordered),
      shippedAt: shipped,
      trackingCode: shipped ? `TRK${100000 + i}` : null,
    });
  }

  const returns: ReturnRequest[] = [];
  if (openReturn) {
    const target = orders.find((o) => o.status === 'delivered') ?? orders[0];
    if (target) {
      const createdMs = Math.min(
        refMs,
        Math.max(orgCreatedMs, Date.parse(target.orderedAt) + 86_400_000)
      );
      const created = new Date(createdMs);
      returns.push({
        id: ids.next('ret'),
        orderId: target.id,
        reason: 'Wrong size — exchanging for a larger pack (demo).',
        status: 'requested',
        amountCents: target.totalCents,
        createdAt: time.iso(created),
        updatedAt: time.iso(created),
        createdBy: VISITOR.id,
      });
    }
  }

  return {
    ...world,
    tables: { conversations: [conversation], messages, reads, orders, returns },
  };
}
