import { createRuntimeId, type PrototypeRuntime, SimulatedServiceError } from '@protoyard/core';
import {
  type ChatDatabase,
  type Conversation,
  type Message,
  type Order,
  type ReturnRequest,
  readMarkerId,
  SUPPORT_THREAD_ID,
} from '../database/schema.ts';
import { ASSISTANT, chunkReply, scriptedReply } from './assistant.ts';
import { CAPABILITIES } from './policy.ts';

export { SUPPORT_THREAD_ID };

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`), enforced even if the UI is bypassed,
 *   2. validates input,
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes with Dexie.
 *
 * Assistant replies stream chunk by chunk INTO a persisted message, so a
 * reload mid-stream shows exactly what had arrived. The "model call" runs as
 * the environment operation `assistant.reply`, which is how the
 * `outage` scenario (failureScope ['assistant.']) makes it fail.
 */

/** `issues` per field lets forms show errors inline (`runService` leaves it to you). */
export class ChatValidationError extends Error {
  readonly issues: Record<string, string>;
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid input');
    this.name = 'ChatValidationError';
    this.issues = issues;
  }
}

export interface ChatServiceOptions {
  /** Delay between stream chunks (ms). Tests pass 0. */
  chunkDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createChatServices(
  runtime: PrototypeRuntime<ChatDatabase>,
  options: ChatServiceOptions = {}
) {
  const { db, session, environment, clock } = runtime;
  const sleep = options.sleep ?? defaultSleep;
  const chunkDelay = options.chunkDelayMs ?? 45;
  const me = () => {
    const id = session.principal()?.persona.id;
    if (!id) throw new Error('No active persona');
    return id;
  };
  /** Replies streaming in THIS page; a `streaming` row not in here was cut off by a reload. */
  const live = new Set<string>();
  const stopRequested = new Set<string>();
  const issued = new Map<string, number>();

  /**
   * A message time that always sorts after the conversation's latest message.
   * The simulated clock is frozen unless running, so `clock.now()` alone
   * would give a prompt and its reply the same instant.
   */
  async function nextAt(conversationId: string): Promise<string> {
    const conversation = await db.conversations.get(conversationId);
    const last = conversation ? Date.parse(conversation.lastMessageAt) : 0;
    const at = Math.max(clock.nowMs(), last + 1, (issued.get(conversationId) ?? 0) + 1);
    issued.set(conversationId, at);
    return new Date(at).toISOString();
  }

  function newReply(prompt: Message, at: string): Message {
    return {
      id: createRuntimeId('msg'),
      conversationId: prompt.conversationId,
      authorId: ASSISTANT.id,
      authorKind: 'assistant',
      body: '',
      at,
      status: 'streaming',
      promptId: prompt.id,
      error: null,
    };
  }

  /** Writes a fresh reply row, then asks the simulated assistant; a failure marks the row `failed`. */
  async function reply(prompt: Message): Promise<Message> {
    const at = await nextAt(prompt.conversationId);
    const message = newReply(prompt, at);
    live.add(message.id);
    try {
      await db.transaction('rw', db.messages, db.conversations, async () => {
        await db.messages.add(message);
        await db.conversations.update(prompt.conversationId, { lastMessageAt: at });
      });
      try {
        const text = await environment.run('assistant.reply', () => scriptedReply(prompt.body));
        return await stream(message, text);
      } catch (error) {
        const reason =
          error instanceof SimulatedServiceError ? error.message : 'The assistant could not reply.';
        return await finish(message, { body: '', status: 'failed', error: reason });
      }
    } finally {
      live.delete(message.id);
      stopRequested.delete(message.id);
    }
  }

  /** Writes `text` into an existing reply row chunk by chunk, honouring Stop. */
  async function stream(message: Message, text: string): Promise<Message> {
    let body = '';
    for (const chunk of chunkReply(text)) {
      if (stopRequested.has(message.id)) return finish(message, { body, status: 'stopped' });
      body += chunk;
      await db.messages.update(message.id, { body });
      await sleep(chunkDelay);
    }
    return finish(message, { body, status: 'sent' });
  }

  /** Orders the active persona may see (the record-level `orders:lookup` rule). */
  async function visibleOrders(): Promise<Order[]> {
    const all = await db.orders.toArray();
    return all.filter((o) => session.can(CAPABILITIES.lookupOrder, o));
  }

  async function finish(message: Message, patch: Partial<Message>): Promise<Message> {
    await db.messages.update(message.id, patch);
    return { ...message, ...patch };
  }

  return {
    async createConversation(input: { title: string }): Promise<Conversation> {
      // Widget always uses ensureSupportThread; kept for parity with the chat template API.
      session.assert(CAPABILITIES.send);
      const title = input.title.trim();
      if (title.length < 2) throw new ChatValidationError({ title: 'Use at least 2 characters.' });
      if (title.length > 60)
        throw new ChatValidationError({ title: 'Keep it under 60 characters.' });
      return environment.run('conversations.create', async () => {
        const at = clock.now().toISOString();
        const conversation: Conversation = {
          id: createRuntimeId('conv'),
          title,
          createdBy: me(),
          createdAt: at,
          lastMessageAt: at,
          handoffRequested: false,
          handoffJoined: false,
        };
        await db.conversations.add(conversation);
        return conversation;
      });
    },

    /** Persists the message first, then the assistant answers (`reply` settles when it is done). */
    async send(
      conversationId: string,
      text: string
    ): Promise<{ message: Message; reply: Promise<Message> }> {
      session.assert(CAPABILITIES.send);
      const body = text.trim();
      if (!body) throw new ChatValidationError({ body: 'Write a message first.' });
      if (body.length > 4000)
        throw new ChatValidationError({ body: 'Messages are limited to 4,000 characters.' });
      const message = await environment.run('messages.send', async () => {
        const msg: Message = {
          id: createRuntimeId('msg'),
          conversationId,
          authorId: me(),
          authorKind: 'person',
          body,
          at: await nextAt(conversationId),
          status: 'sent',
          promptId: null,
          error: null,
        };
        await db.transaction('rw', db.messages, db.conversations, db.reads, async () => {
          await db.messages.add(msg);
          await db.conversations.update(conversationId, { lastMessageAt: msg.at });
          await db.reads.put({
            id: readMarkerId(conversationId, msg.authorId),
            conversationId,
            personaId: msg.authorId,
            lastReadAt: msg.at,
          });
        });
        return msg;
      });
      return { message, reply: reply(message) };
    },

    /**
     * Replaces a failed or stopped reply with a fresh attempt at the same prompt.
     * The old reply is deleted in the same `environment.run('assistant.reply')`
     * and transaction that writes the new one, so a simulated failure (offline,
     * outage) rejects and leaves the old reply exactly as it was.
     */
    async retry(replyId: string): Promise<Message | null> {
      session.assert(CAPABILITIES.send);
      const old = await db.messages.get(replyId);
      const prompt = old?.promptId ? await db.messages.get(old.promptId) : undefined;
      if (!old || !prompt || live.has(replyId)) return null;
      const at = await nextAt(prompt.conversationId);
      const message = newReply(prompt, at);
      live.add(message.id);
      try {
        const text = await environment.run('assistant.reply', async () => {
          const text = scriptedReply(prompt.body);
          await db.transaction('rw', db.messages, db.conversations, async () => {
            await db.messages.delete(replyId);
            await db.messages.add(message);
            await db.conversations.update(prompt.conversationId, { lastMessageAt: at });
          });
          return text;
        });
        return await stream(message, text);
      } finally {
        live.delete(message.id);
        stopRequested.delete(message.id);
      }
    },

    /** Stops a streaming reply. One orphaned by a reload is closed directly. */
    async cancel(replyId: string): Promise<void> {
      if (live.has(replyId)) {
        stopRequested.add(replyId);
        return;
      }
      const message = await db.messages.get(replyId);
      if (message?.status === 'streaming') await db.messages.update(replyId, { status: 'stopped' });
    },

    /** True while the reply is streaming in this page. */
    isLive(replyId: string): boolean {
      return live.has(replyId);
    },

    async markRead(conversationId: string): Promise<void> {
      const personaId = me();
      const conversation = await db.conversations.get(conversationId);
      if (!conversation) return;
      // Replies can be stamped ahead of a frozen clock; reading must cover them.
      const at = new Date(
        Math.max(clock.nowMs(), Date.parse(conversation.lastMessageAt))
      ).toISOString();
      await db.reads.put({
        id: readMarkerId(conversationId, personaId),
        conversationId,
        personaId,
        lastReadAt: at,
      });
    },

    async unreadCount(conversationId: string, personaId: string): Promise<number> {
      const marker = await db.reads.get(readMarkerId(conversationId, personaId));
      return db.messages
        .where('[conversationId+at]')
        .between([conversationId, marker?.lastReadAt ?? ''], [conversationId, '￿'], false, true)
        .filter((m) => m.authorId !== personaId)
        .count();
    },

    async ensureSupportThread(): Promise<Conversation> {
      session.assert(CAPABILITIES.read);
      const existing = await db.conversations.get(SUPPORT_THREAD_ID);
      if (existing) return existing;
      return environment.run('conversations.ensure', async () => {
        const at = clock.now().toISOString();
        const conversation: Conversation = {
          id: SUPPORT_THREAD_ID,
          title: 'Support',
          createdBy: me(),
          createdAt: at,
          lastMessageAt: at,
          handoffRequested: false,
          handoffJoined: false,
        };
        await db.conversations.add(conversation);
        return conversation;
      });
    },

    async requestHandoff(conversationId: string): Promise<Conversation> {
      session.assert(CAPABILITIES.handoff);
      const conversation = await db.conversations.get(conversationId);
      if (!conversation) throw new ChatValidationError({ body: 'Conversation not found.' });
      return environment.run('support.handoff', async () => {
        const at = await nextAt(conversationId);
        await db.transaction('rw', db.conversations, db.messages, async () => {
          await db.conversations.update(conversationId, {
            handoffRequested: true,
            handoffJoined: true,
            lastMessageAt: at,
          });
          await db.messages.add({
            id: createRuntimeId('msg'),
            conversationId,
            authorId: 'user_agent',
            authorKind: 'person',
            body: 'Hi, I am Casey from support (fictional). I joined this thread — how can I help?',
            at,
            status: 'sent',
            promptId: null,
            error: null,
          });
        });
        return (await db.conversations.get(conversationId)) as Conversation;
      });
    },

    /**
     * Finds one of the active persona's orders by number or id. Visitors only
     * see orders on their own email (the `orders:lookup` rule in policy.ts);
     * someone else's order is reported as not found on your account.
     */
    async lookupOrder(numberOrId: string): Promise<Order> {
      session.assert(CAPABILITIES.lookupOrder);
      const q = numberOrId.trim().toUpperCase();
      if (q.length < 3)
        throw new ChatValidationError({ order: 'Enter an order number like NW-10040.' });
      return environment.run('orders.lookup', async () => {
        const mine = await visibleOrders();
        const order =
          mine.find((o) => o.number.toUpperCase() === q || o.id.toUpperCase() === q) ??
          mine.find((o) => o.number.toUpperCase().includes(q));
        if (!order)
          throw new ChatValidationError({
            order: `No order matching "${numberOrId.trim()}" on your account.`,
          });
        return order;
      });
    },

    /**
     * The active persona's most recent order (by `orderedAt`), or `null`.
     * Prefills the order input, so the default lookup always exists in the
     * current world. Read only and local, like `listReturns`.
     */
    async latestOrder(): Promise<Order | null> {
      if (!session.can(CAPABILITIES.lookupOrder)) return null;
      const mine = await visibleOrders();
      mine.sort((a, b) => b.orderedAt.localeCompare(a.orderedAt) || b.id.localeCompare(a.id));
      return mine[0] ?? null;
    },

    async listOrdersForEmail(email: string): Promise<Order[]> {
      session.assert(CAPABILITIES.lookupOrder);
      const key = email.trim().toLowerCase();
      if (!session.can(CAPABILITIES.lookupOrder, { email: key }))
        throw new ChatValidationError({ email: 'You can only list the orders on your own email.' });
      return environment.run('orders.listByEmail', async () => {
        const all = await db.orders.toArray();
        return all.filter((o) => o.email.toLowerCase() === key);
      });
    },

    async requestReturn(input: {
      orderId: string;
      reason: string;
      amountCents?: number;
    }): Promise<ReturnRequest> {
      session.assert(CAPABILITIES.requestReturn);
      const reason = input.reason.trim();
      if (reason.length < 3)
        throw new ChatValidationError({ reason: 'Describe the return in a few words.' });
      if (reason.length > 200)
        throw new ChatValidationError({ reason: 'Keep the reason under 200 characters.' });
      return environment.run('returns.create', async () => {
        const order = await db.orders.get(input.orderId);
        // Someone else's order reads exactly like a missing one.
        if (!order || !session.can(CAPABILITIES.requestReturn, order))
          throw new ChatValidationError({ order: 'Order not found on your account.' });
        if (order.status === 'cancelled')
          throw new ChatValidationError({ order: 'Cancelled orders cannot be returned.' });
        const existing = await db.returns.where('orderId').equals(order.id).first();
        if (existing && existing.status !== 'denied')
          throw new ChatValidationError({ order: 'A return is already open for this order.' });
        const amount =
          input.amountCents !== undefined && Number.isFinite(input.amountCents)
            ? Math.max(0, Math.floor(input.amountCents))
            : order.totalCents;
        if (amount > order.totalCents)
          throw new ChatValidationError({ amount: 'Refund cannot exceed the order total.' });
        const at = clock.now().toISOString();
        const row: ReturnRequest = {
          id: createRuntimeId('ret'),
          orderId: order.id,
          reason,
          status: 'requested',
          amountCents: amount,
          createdAt: at,
          updatedAt: at,
          createdBy: me(),
        };
        await db.transaction('rw', db.returns, db.messages, db.conversations, async () => {
          await db.returns.add(row);
          const msgAt = await nextAt(SUPPORT_THREAD_ID);
          await db.messages.add({
            id: createRuntimeId('msg'),
            conversationId: SUPPORT_THREAD_ID,
            authorId: ASSISTANT.id,
            authorKind: 'assistant',
            body: `Return ${row.id} opened for ${order.number} (${reason}). Status: requested. This is a simulated return — no real refund.`,
            at: msgAt,
            status: 'sent',
            promptId: null,
            error: null,
          });
          await db.conversations.update(SUPPORT_THREAD_ID, { lastMessageAt: msgAt });
        });
        return row;
      });
    },

    /** Returns on the orders the active persona can see, newest first. */
    async listReturns(): Promise<ReturnRequest[]> {
      session.assert(CAPABILITIES.readReturns);
      const ids = new Set((await visibleOrders()).map((o) => o.id));
      const rows = await db.returns.orderBy('createdAt').reverse().toArray();
      return rows.filter((r) => ids.has(r.orderId));
    },
  };
}

export type ChatServices = ReturnType<typeof createChatServices>;
