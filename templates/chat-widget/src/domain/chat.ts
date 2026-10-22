import {
  createRuntimeId,
  nextMonotonicIso,
  type PrototypeRuntime,
  SimulatedServiceError,
} from '@protoyard/core';
import {
  type ChatDatabase,
  type Conversation,
  type Message,
  readMarkerId,
  SUPPORT_THREAD_ID,
} from '../database/schema.ts';

export { SUPPORT_THREAD_ID };

import { ASSISTANT, chunkReply, scriptedReply } from './assistant.ts';
import { CAPABILITIES } from './policy.ts';

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
 * `assistant-outage` scenario (failureScope ['assistant.']) makes it fail.
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
   * would give a prompt and its reply the same instant. Uses
   * {@link nextMonotonicIso} so paused-clock bursts keep insertion order.
   */
  async function nextAt(conversationId: string): Promise<string> {
    const conversation = await db.conversations.get(conversationId);
    const remembered = issued.get(conversationId);
    const storedMs = conversation ? Date.parse(conversation.lastMessageAt) : Number.NaN;
    const lastMs = Math.max(remembered ?? 0, Number.isNaN(storedMs) ? 0 : storedMs);
    const lastIso = lastMs > 0 ? new Date(lastMs).toISOString() : null;
    const at = nextMonotonicIso(lastIso, clock.nowMs());
    issued.set(conversationId, Date.parse(at));
    return at;
  }

  async function reply(prompt: Message): Promise<Message> {
    const at = await nextAt(prompt.conversationId);
    const message: Message = {
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
    live.add(message.id);
    await db.transaction('rw', db.messages, db.conversations, async () => {
      await db.messages.add(message);
      await db.conversations.update(prompt.conversationId, { lastMessageAt: at });
    });
    try {
      const text = await environment.run('assistant.reply', () => scriptedReply(prompt.body));
      let body = '';
      for (const chunk of chunkReply(text)) {
        if (stopRequested.has(message.id)) return finish(message, { body, status: 'stopped' });
        body += chunk;
        await db.messages.update(message.id, { body });
        await sleep(chunkDelay);
      }
      return finish(message, { body, status: 'sent' });
    } catch (error) {
      const reason =
        error instanceof SimulatedServiceError ? error.message : 'The assistant could not reply.';
      return finish(message, { body: '', status: 'failed', error: reason });
    } finally {
      live.delete(message.id);
      stopRequested.delete(message.id);
    }
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

    /** Replaces a failed or stopped reply with a fresh attempt at the same prompt. */
    async retry(replyId: string): Promise<Message | null> {
      session.assert(CAPABILITIES.send);
      const failed = await db.messages.get(replyId);
      const prompt = failed?.promptId ? await db.messages.get(failed.promptId) : undefined;
      if (!failed || !prompt) return null;
      await db.messages.delete(replyId);
      return reply(prompt);
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
  };
}

export type ChatServices = ReturnType<typeof createChatServices>;
