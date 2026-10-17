import { createRuntimeId, type PrototypeRuntime, SimulatedServiceError } from '@protoyard/core';
import type {
  Agent,
  AgentRun,
  ChatDatabase,
  Conversation,
  Message,
  Participant,
} from '../database/schema.ts';
import { chunkReply, mentionedAgents, scriptedReply } from './agents.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Chat services. Sending a message persists it first; agent replies then run
 * as "runs" that stream chunk by chunk into a message row, so a reload in the
 * middle of a stream shows exactly what had arrived (and the run can resume or
 * be retried). Failures come from the simulated environment, not randomness.
 */

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
  const now = () => clock.now().toISOString();
  const me = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona');
    return principal.persona.id;
  };
  const cancelled = new Set<string>();
  /** Runs streaming in THIS page; a `streaming` row not in here was cut off by a reload. */
  const live = new Set<string>();

  /**
   * Message time that always sorts after the conversation's latest message.
   * The simulated clock is frozen unless running, so `now()` alone would give
   * a prompt and its reply the same instant (and an undefined order).
   */
  const issued = new Map<string, number>();
  async function nextAt(conversationId: string): Promise<string> {
    const conversation = await db.conversations.get(conversationId);
    const last = conversation ? Date.parse(conversation.lastMessageAt) : 0;
    // Several agents answering one prompt start concurrently; remembering the
    // last instant handed out keeps their replies from sharing a timestamp.
    const at = Math.max(clock.nowMs(), last + 1, (issued.get(conversationId) ?? 0) + 1);
    issued.set(conversationId, at);
    return new Date(at).toISOString();
  }

  async function agentsIn(conversationId: string): Promise<Agent[]> {
    const members = await db.participants.where('conversationId').equals(conversationId).toArray();
    const ids = members.filter((m) => m.memberKind === 'agent').map((m) => m.memberId);
    return (await db.agents.bulkGet(ids)).filter((a): a is Agent => Boolean(a));
  }

  async function runAgent(agent: Agent, prompt: Message): Promise<AgentRun> {
    const run: AgentRun = {
      id: createRuntimeId('run'),
      conversationId: prompt.conversationId,
      agentId: agent.id,
      promptMessageId: prompt.id,
      status: 'streaming',
      error: null,
      startedAt: now(),
      finishedAt: null,
      tokens: 0,
    };
    live.add(run.id);
    const at = await nextAt(prompt.conversationId);
    const reply: Message = {
      id: createRuntimeId('msg'),
      conversationId: prompt.conversationId,
      authorId: agent.id,
      authorKind: 'agent',
      body: '',
      at,
      status: 'streaming',
      runId: run.id,
    };
    await db.transaction('rw', db.runs, db.messages, db.conversations, async () => {
      await db.runs.add(run);
      await db.messages.add(reply);
      await db.conversations.update(prompt.conversationId, { lastMessageAt: at });
    });

    try {
      // The "model request" goes through the simulated environment: offline,
      // latency and failure modes apply here.
      const text = await environment.run(`agents.${agent.handle}`, () =>
        scriptedReply(agent, prompt.body)
      );
      let body = '';
      for (const chunk of chunkReply(text)) {
        if (cancelled.has(run.id)) {
          await finish(run, reply, body, 'cancelled', null);
          return { ...run, status: 'cancelled' };
        }
        body += chunk;
        await db.messages.update(reply.id, { body });
        await sleep(chunkDelay);
      }
      await finish(run, reply, body, 'done', null);
      return { ...run, status: 'done' };
    } catch (error) {
      const message =
        error instanceof SimulatedServiceError ? error.message : 'The agent could not respond.';
      await finish(run, reply, '', 'error', message);
      return { ...run, status: 'error', error: message };
    } finally {
      live.delete(run.id);
      cancelled.delete(run.id);
    }
  }

  async function finish(
    run: AgentRun,
    reply: Message,
    body: string,
    status: AgentRun['status'],
    error: string | null
  ) {
    await db.transaction('rw', db.runs, db.messages, async () => {
      await db.runs.update(run.id, {
        status,
        error,
        finishedAt: now(),
        tokens: Math.ceil(body.length / 4),
      });
      await db.messages.update(reply.id, {
        body: status === 'error' ? (error ?? 'Failed') : body,
        status: status === 'error' ? 'failed' : 'sent',
      });
    });
  }

  return {
    async createConversation(input: {
      title: string;
      agentIds: string[];
      memberIds?: string[];
    }): Promise<Conversation> {
      session.assert(CAPABILITIES.createConversation);
      const title = input.title.trim();
      if (title.length < 2) throw new Error('Give the conversation a name (2+ characters).');
      return environment.run('conversations.create', () =>
        db.transaction('rw', db.conversations, db.participants, async () => {
          const at = now();
          const conversation: Conversation = {
            id: createRuntimeId('conv'),
            title: title.slice(0, 60),
            kind: input.agentIds.length + (input.memberIds?.length ?? 0) > 1 ? 'channel' : 'direct',
            createdBy: me(),
            createdAt: at,
            lastMessageAt: at,
            pinned: false,
            archived: false,
          };
          await db.conversations.add(conversation);
          const people = [...new Set([me(), ...(input.memberIds ?? [])])];
          const rows: Participant[] = [
            ...people.map((memberId) => ({
              id: createRuntimeId('part'),
              conversationId: conversation.id,
              memberId,
              memberKind: 'person' as const,
              lastReadAt: at,
            })),
            ...input.agentIds.map((memberId) => ({
              id: createRuntimeId('part'),
              conversationId: conversation.id,
              memberId,
              memberKind: 'agent' as const,
              lastReadAt: at,
            })),
          ];
          await db.participants.bulkAdd(rows);
          return conversation;
        })
      );
    },

    /**
     * Persists the message, then lets agents reply: every agent @mentioned,
     * or the conversation's only agent in a direct chat.
     */
    async send(
      conversationId: string,
      text: string
    ): Promise<{ message: Message; runs: Promise<AgentRun[]> }> {
      session.assert(CAPABILITIES.send);
      const body = text.trim();
      if (!body) throw new Error('Write a message first.');
      if (body.length > 4000) throw new Error('Messages are limited to 4,000 characters.');
      const message = await environment.run('messages.send', () =>
        db.transaction('rw', db.messages, db.conversations, db.participants, async () => {
          const msg: Message = {
            id: createRuntimeId('msg'),
            conversationId,
            authorId: me(),
            authorKind: 'person',
            body,
            at: await nextAt(conversationId),
            status: 'sent',
            runId: null,
          };
          await db.messages.add(msg);
          await db.conversations.update(conversationId, { lastMessageAt: msg.at });
          await db.participants
            .where('[conversationId+memberId]')
            .equals([conversationId, me()])
            .modify({ lastReadAt: msg.at });
          return msg;
        })
      );
      const agents = await agentsIn(conversationId);
      const mentioned = mentionedAgents(body, agents);
      const responders = mentioned.length > 0 ? mentioned : agents.length === 1 ? agents : [];
      const canInvoke = session.can(CAPABILITIES.invokeAgents);
      const runs = canInvoke
        ? Promise.all(responders.map((agent) => runAgent(agent, message)))
        : Promise.resolve([]);
      return { message, runs };
    },

    /** Retries a failed run with the original prompt. */
    async retry(runId: string): Promise<AgentRun | null> {
      session.assert(CAPABILITIES.invokeAgents);
      const run = await db.runs.get(runId);
      if (!run) return null;
      const [agent, prompt] = await Promise.all([
        db.agents.get(run.agentId),
        db.messages.get(run.promptMessageId),
      ]);
      if (!agent || !prompt) return null;
      await db.messages.where('runId').equals(runId).delete();
      return runAgent(agent, prompt);
    },

    /** Stops a streaming run. A run orphaned by a reload is closed directly. */
    async cancel(runId: string): Promise<void> {
      if (live.has(runId)) {
        cancelled.add(runId);
        return;
      }
      const run = await db.runs.get(runId);
      if (run?.status !== 'streaming') return;
      const reply = await db.messages.where('runId').equals(runId).first();
      if (reply) await finish(run, reply, reply.body, 'cancelled', null);
      else await db.runs.update(runId, { status: 'cancelled', finishedAt: now() });
    },

    /** True while the run is streaming in this page (false after a reload cut it off). */
    isLive(runId: string): boolean {
      return live.has(runId);
    },

    async markRead(conversationId: string): Promise<void> {
      // Replies are stamped after the latest message, which can be ahead of a
      // frozen simulated clock — reading must cover them too.
      const conversation = await db.conversations.get(conversationId);
      const at = new Date(
        Math.max(clock.nowMs(), conversation ? Date.parse(conversation.lastMessageAt) : 0)
      ).toISOString();
      await db.participants
        .where('[conversationId+memberId]')
        .equals([conversationId, me()])
        .modify({ lastReadAt: at });
    },

    async unreadCount(conversationId: string, personaId: string): Promise<number> {
      const participant = await db.participants
        .where('[conversationId+memberId]')
        .equals([conversationId, personaId])
        .first();
      if (!participant) return 0;
      return db.messages
        .where('[conversationId+at]')
        .between([conversationId, participant.lastReadAt], [conversationId, '￿'], false, true)
        .filter((m) => m.authorId !== personaId)
        .count();
    },

    async rename(conversationId: string, title: string): Promise<void> {
      const conversation = await db.conversations.get(conversationId);
      session.assert(CAPABILITIES.manageConversation, conversation);
      const clean = title.trim();
      if (clean.length < 2) throw new Error('Name must have at least 2 characters.');
      await environment.run('conversations.rename', () =>
        db.conversations.update(conversationId, { title: clean.slice(0, 60) })
      );
    },

    async togglePin(conversationId: string): Promise<void> {
      session.assert(CAPABILITIES.send);
      const conversation = await db.conversations.get(conversationId);
      if (conversation)
        await db.conversations.update(conversationId, { pinned: !conversation.pinned });
    },

    async archive(conversationId: string, archived = true): Promise<void> {
      const conversation = await db.conversations.get(conversationId);
      session.assert(CAPABILITIES.manageConversation, conversation);
      await environment.run('conversations.archive', () =>
        db.conversations.update(conversationId, { archived })
      );
    },

    async remove(conversationId: string): Promise<void> {
      const conversation = await db.conversations.get(conversationId);
      session.assert(CAPABILITIES.manageConversation, conversation);
      await environment.run('conversations.delete', () =>
        db.transaction('rw', db.conversations, db.participants, db.messages, db.runs, async () => {
          await db.messages.where('conversationId').equals(conversationId).delete();
          await db.runs.where('conversationId').equals(conversationId).delete();
          await db.participants.where('conversationId').equals(conversationId).delete();
          await db.conversations.delete(conversationId);
        })
      );
    },

    async search(query: string, limit = 30): Promise<Message[]> {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      return db.messages
        .filter((m) => m.body.toLowerCase().includes(q))
        .limit(limit)
        .toArray();
    },
  };
}

export type ChatServices = ReturnType<typeof createChatServices>;
