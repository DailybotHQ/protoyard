import { createVoiceSession, type VoiceSession } from '@protoyard/ai/voice';
import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import {
  type Channel,
  type ChannelKind,
  type ChatFile,
  dmKeyFor,
  type Huddle,
  type Message,
  memberId,
  type Presence,
  presenceId,
  type Reaction,
  reactionId,
  readMarkerId,
  type TeamChatDatabase,
} from '../database/schema.ts';
import { BOTS, botReply, matchBot, SLASH_COMMANDS } from './bots.ts';
import { CAPABILITIES } from './policy.ts';

export { BOTS, CAPABILITIES, matchBot, SLASH_COMMANDS };

const ChannelInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must have at least 2 characters')
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, numbers and dashes'),
  topic: z.string().trim().max(120).default(''),
  kind: z.enum(['public', 'private']).default('public'),
});

const MessageInput = z.object({
  body: z.string().trim().min(1, 'Write a message').max(4_000),
  threadId: z.string().min(1).nullable().optional(),
  fileId: z.string().min(1).nullable().optional(),
});

export class TeamChatValidationError extends ValidationError {
  constructor(issues: Record<string, string>) {
    super(issues);
    this.name = 'TeamChatValidationError';
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  try {
    return parseInput(schema, input);
  } catch (error) {
    if (error instanceof ValidationError) throw new TeamChatValidationError(error.issues);
    throw error;
  }
}

/** Aggregated reaction chip for the message list. */
export interface ReactionSummary {
  messageId: string;
  emoji: string;
  count: number;
  /** True when the active persona already reacted with this emoji. */
  mine: boolean;
}

export function createTeamChatServices(runtime: PrototypeRuntime<TeamChatDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const seed = () => runtime.scenarios.active()?.scenario.seed ?? 1;

  async function getMembership(channelId: string, personaId: string) {
    return db.channelMembers.get(memberId(channelId, personaId));
  }

  /** Public channels are readable without membership; private and DMs require it. */
  async function assertCanReadChannel(channelId: string): Promise<Channel> {
    const channel = await db.channels.get(channelId);
    if (!channel) throw new TeamChatValidationError({ channelId: 'Channel not found' });
    if (channel.kind === 'public') return channel;
    const me = actorId();
    if (!(await getMembership(channelId, me))) {
      throw new TeamChatValidationError({
        channelId: 'You are not a member of this channel',
      });
    }
    return channel;
  }

  /** Every write into a channel requires an existing membership row. */
  async function assertMember(channelId: string) {
    const channel = await db.channels.get(channelId);
    if (!channel) throw new TeamChatValidationError({ channelId: 'Channel not found' });
    const me = actorId();
    if (!(await getMembership(channelId, me))) {
      throw new TeamChatValidationError({
        channelId:
          channel.kind === 'public'
            ? 'Join this channel before posting'
            : 'You are not a member of this channel',
      });
    }
    return { channel, me };
  }

  async function accessibleChannelIds(workspaceId: string): Promise<Set<string>> {
    const me = actorId();
    const channels = await db.channels.where('workspaceId').equals(workspaceId).toArray();
    const memberships = await db.channelMembers.where('personaId').equals(me).toArray();
    const mine = new Set(memberships.map((m) => m.channelId));
    return new Set(channels.filter((c) => c.kind === 'public' || mine.has(c.id)).map((c) => c.id));
  }

  async function touchChannel(channelId: string, at: string) {
    const channel = await db.channels.get(channelId);
    if (!channel) throw new Error(`Unknown channel ${channelId}`);
    await db.channels.put({ ...channel, lastMessageAt: at });
  }

  /** Message write used inside an open transaction (no nested transaction). */
  async function writeMessage(
    channelId: string,
    body: string,
    options: {
      authorId: string;
      authorKind: 'person' | 'bot';
      threadId?: string | null;
      fileId?: string | null;
    }
  ): Promise<Message> {
    const at = now();
    const message: Message = {
      id: createRuntimeId('msg'),
      channelId,
      authorId: options.authorId,
      authorKind: options.authorKind,
      body,
      at,
      threadId: options.threadId ?? null,
      fileId: options.fileId ?? null,
    };
    await db.messages.put(message);
    await touchChannel(channelId, at);
    await db.reads.put({
      id: readMarkerId(channelId, options.authorId),
      channelId,
      personaId: options.authorId,
      lastReadAt: at,
    });
    return message;
  }

  async function postMessage(
    channelId: string,
    body: string,
    options: {
      authorId: string;
      authorKind: 'person' | 'bot';
      threadId?: string | null;
      fileId?: string | null;
    }
  ): Promise<Message> {
    return db.transaction('rw', db.messages, db.channels, db.reads, async () =>
      writeMessage(channelId, body, options)
    );
  }

  async function startHuddleInternal(channelId: string): Promise<Huddle> {
    session.assert(CAPABILITIES['huddle:start']);
    await assertMember(channelId);
    return environment.run('huddle.start', async () => {
      const me = actorId();
      return db.transaction('rw', db.huddles, db.presence, async () => {
        const open = await db.huddles.where('channelId').equals(channelId).toArray();
        const active = open.find((h) => !h.endedAt);
        if (active) return active;
        const huddle: Huddle = {
          id: createRuntimeId('huddle'),
          channelId,
          startedBy: me,
          startedAt: now(),
          endedAt: null,
          captions: '',
        };
        await db.huddles.put(huddle);
        await db.presence.put({
          id: presenceId(me),
          personaId: me,
          status: 'in-huddle',
          statusText: 'In a simulated huddle',
          updatedAt: now(),
        });
        return huddle;
      });
    });
  }

  async function appendHuddleCaption(huddleId: string, transcript: string) {
    session.assert(CAPABILITIES['huddle:start']);
    const lineText = transcript.trim();
    if (!lineText) return null;
    return environment.run('huddle.caption', async () => {
      return db.transaction('rw', db.huddles, async () => {
        const huddle = await db.huddles.get(huddleId);
        if (!huddle || huddle.endedAt) return null;
        const line = `${actorId()}: ${lineText}`;
        const captions = huddle.captions ? `${huddle.captions}\n${line}` : line;
        const updated = { ...huddle, captions };
        await db.huddles.put(updated);
        return updated;
      });
    });
  }

  return {
    /** Whether the active persona may perform a capability (UI enablement). */
    can(capability: string): boolean {
      return session.can(capability);
    },

    async listWorkspaces() {
      session.assert(CAPABILITIES['workspace:read']);
      const rows = await db.workspaces.toArray();
      return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },

    async listChannels(workspaceId: string) {
      session.assert(CAPABILITIES['channel:read']);
      const me = actorId();
      const channels = await db.channels.where('workspaceId').equals(workspaceId).toArray();
      const memberships = await db.channelMembers.where('personaId').equals(me).toArray();
      const mine = new Set(memberships.map((m) => m.channelId));
      return channels
        .filter((c) => c.kind === 'public' || mine.has(c.id))
        .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
    },

    /** True when the active persona already has a membership row. */
    async isMember(channelId: string): Promise<boolean> {
      session.assert(CAPABILITIES['channel:read']);
      return Boolean(await getMembership(channelId, actorId()));
    },

    /**
     * Explicit join for public channels. Private channels and DMs are
     * invitation-only (membership is created with the channel or DM).
     */
    async joinChannel(channelId: string) {
      session.assert(CAPABILITIES['message:create']);
      const channel = await db.channels.get(channelId);
      if (!channel) throw new TeamChatValidationError({ channelId: 'Channel not found' });
      if (channel.kind !== 'public') {
        throw new TeamChatValidationError({
          channelId: 'Only public channels can be joined this way',
        });
      }
      return environment.run('channel.join', async () => {
        const me = actorId();
        return db.transaction('rw', db.channelMembers, async () => {
          const existing = await getMembership(channelId, me);
          if (existing) return existing;
          const row = {
            id: memberId(channelId, me),
            channelId,
            personaId: me,
            role: 'member' as const,
            joinedAt: now(),
          };
          await db.channelMembers.put(row);
          return row;
        });
      });
    },

    async createChannel(workspaceId: string, input: unknown) {
      session.assert(CAPABILITIES['channel:create']);
      const data = parse(ChannelInput, input);
      return environment.run('channel.create', async () => {
        const me = actorId();
        const at = now();
        const channel: Channel = {
          id: createRuntimeId('channel'),
          workspaceId,
          kind: data.kind as ChannelKind,
          name: data.name,
          topic: data.topic,
          createdBy: me,
          createdAt: at,
          dmKey: null,
          lastMessageAt: at,
        };
        await db.transaction('rw', db.channels, db.channelMembers, async () => {
          await db.channels.put(channel);
          await db.channelMembers.put({
            id: memberId(channel.id, me),
            channelId: channel.id,
            personaId: me,
            role: 'owner',
            joinedAt: at,
          });
        });
        return channel;
      });
    },

    async openDm(workspaceId: string, otherPersonaId: string) {
      session.assert(CAPABILITIES['channel:create']);
      const me = actorId();
      if (otherPersonaId === me) {
        throw new TeamChatValidationError({ personaId: 'Pick someone else for a DM' });
      }
      const other = await db.table('py_personas').get(otherPersonaId);
      if (!other) throw new TeamChatValidationError({ personaId: 'Person not found' });
      return environment.run('channel.dm', async () => {
        const key = dmKeyFor(me, otherPersonaId);
        const existing = await db.channels.where('dmKey').equals(key).first();
        if (existing) return existing;
        const at = now();
        const channel: Channel = {
          id: createRuntimeId('dm'),
          workspaceId,
          kind: 'dm',
          name: String((other as { name?: string }).name ?? 'Direct message'),
          topic: 'Direct message',
          createdBy: me,
          createdAt: at,
          dmKey: key,
          lastMessageAt: at,
        };
        await db.transaction('rw', db.channels, db.channelMembers, async () => {
          await db.channels.put(channel);
          for (const personaId of [me, otherPersonaId]) {
            await db.channelMembers.put({
              id: memberId(channel.id, personaId),
              channelId: channel.id,
              personaId,
              role: 'member',
              joinedAt: at,
            });
          }
        });
        return channel;
      });
    },

    async listMessages(channelId: string, threadId: string | null = null) {
      session.assert(CAPABILITIES['message:read']);
      await assertCanReadChannel(channelId);
      const all = await db.messages.where('channelId').equals(channelId).sortBy('at');
      return all.filter((m) => (threadId ? m.threadId === threadId : m.threadId === null));
    },

    async listReactionSummaries(channelId: string): Promise<ReactionSummary[]> {
      session.assert(CAPABILITIES['message:read']);
      await assertCanReadChannel(channelId);
      const me = actorId();
      const messages = await db.messages.where('channelId').equals(channelId).toArray();
      const messageIds = new Set(messages.map((m) => m.id));
      const rows = await db.reactions.toArray();
      const map = new Map<string, ReactionSummary>();
      for (const row of rows) {
        if (!messageIds.has(row.messageId)) continue;
        const key = `${row.messageId}\0${row.emoji}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          if (row.personaId === me) existing.mine = true;
        } else {
          map.set(key, {
            messageId: row.messageId,
            emoji: row.emoji,
            count: 1,
            mine: row.personaId === me,
          });
        }
      }
      return [...map.values()].sort((a, b) =>
        a.messageId === b.messageId
          ? a.emoji.localeCompare(b.emoji)
          : a.messageId.localeCompare(b.messageId)
      );
    },

    async sendMessage(channelId: string, input: unknown) {
      session.assert(CAPABILITIES['message:create']);
      const data = parse(MessageInput, input);
      await assertMember(channelId);

      return environment.run('message.send', async () => {
        const me = actorId();

        if (data.body.trim().toLowerCase().startsWith('/huddle')) {
          const huddle = await startHuddleInternal(channelId);
          const message = await postMessage(channelId, 'Started a simulated huddle', {
            authorId: me,
            authorKind: 'person',
            threadId: data.threadId ?? null,
          });
          return { message, bot: null as Message | null, huddle };
        }

        if (data.fileId) {
          const file = await db.files.get(data.fileId);
          if (!file || file.channelId !== channelId) {
            throw new TeamChatValidationError({ fileId: 'File not found in this channel' });
          }
        }

        const message = await postMessage(channelId, data.body, {
          authorId: me,
          authorKind: 'person',
          threadId: data.threadId ?? null,
          fileId: data.fileId ?? null,
        });

        const bot = matchBot(data.body);
        let botMessage: Message | null = null;
        if (bot) {
          const reply = botReply(bot.id, data.body, seed());
          botMessage = await postMessage(channelId, reply, {
            authorId: bot.id,
            authorKind: 'bot',
            threadId: data.threadId ?? null,
          });
        }
        return { message, bot: botMessage, huddle: null as Huddle | null };
      });
    },

    async toggleReaction(messageId: string, emoji: string) {
      session.assert(CAPABILITIES['message:react']);
      const clean = emoji.trim().slice(0, 16);
      if (!clean) throw new TeamChatValidationError({ emoji: 'Pick an emoji' });
      return environment.run('message.react', async () => {
        const message = await db.messages.get(messageId);
        if (!message) throw new TeamChatValidationError({ messageId: 'Message not found' });
        await assertMember(message.channelId);
        const me = actorId();
        return db.transaction('rw', db.reactions, async () => {
          const id = reactionId(messageId, me, clean);
          const existing = await db.reactions.get(id);
          if (existing) {
            await db.reactions.delete(id);
            return null;
          }
          const row: Reaction = {
            id,
            messageId,
            emoji: clean,
            personaId: me,
            at: now(),
          };
          await db.reactions.put(row);
          return row;
        });
      });
    },

    async shareFile(
      channelId: string,
      input: { name: string; sizeBytes: number; mimeType?: string }
    ) {
      session.assert(CAPABILITIES['file:share']);
      const name = input.name.trim();
      if (!name) throw new TeamChatValidationError({ name: 'File name is required' });
      if (
        !Number.isFinite(input.sizeBytes) ||
        input.sizeBytes < 0 ||
        input.sizeBytes > 25_000_000
      ) {
        throw new TeamChatValidationError({ sizeBytes: 'File size must be under 25 MB' });
      }
      await assertMember(channelId);
      return environment.run('file.share', async () => {
        const me = actorId();
        return db.transaction('rw', db.files, db.messages, db.channels, db.reads, async () => {
          const file: ChatFile = {
            id: createRuntimeId('file'),
            channelId,
            name,
            sizeBytes: Math.floor(input.sizeBytes),
            mimeType: input.mimeType?.trim() || 'application/octet-stream',
            uploadedBy: me,
            at: now(),
          };
          await db.files.put(file);
          await writeMessage(channelId, `Shared ${file.name}`, {
            authorId: me,
            authorKind: 'person',
            fileId: file.id,
          });
          return file;
        });
      });
    },

    async markRead(channelId: string) {
      session.assert(CAPABILITIES['message:read']);
      await assertCanReadChannel(channelId);
      return environment.run('message.read', async () => {
        const me = actorId();
        return db.transaction('rw', db.reads, async () => {
          const row = {
            id: readMarkerId(channelId, me),
            channelId,
            personaId: me,
            lastReadAt: now(),
          };
          await db.reads.put(row);
          return row;
        });
      });
    },

    async unreadCount(channelId: string): Promise<number> {
      session.assert(CAPABILITIES['message:read']);
      await assertCanReadChannel(channelId);
      const me = actorId();
      const marker = await db.reads.get(readMarkerId(channelId, me));
      const since = marker?.lastReadAt ?? '';
      const messages = await db.messages.where('channelId').equals(channelId).toArray();
      return messages.filter((m) => m.at > since && m.authorId !== me).length;
    },

    async search(workspaceId: string, query: string) {
      session.assert(CAPABILITIES['search:run']);
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [] as Message[];
      const ids = await accessibleChannelIds(workspaceId);
      const messages = await db.messages.toArray();
      return messages
        .filter((m) => ids.has(m.channelId) && m.body.toLowerCase().includes(q))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 50);
    },

    async listPresence() {
      session.assert(CAPABILITIES['workspace:read']);
      return db.presence.toArray();
    },

    async setPresence(status: Presence['status'], statusText = '') {
      session.assert(CAPABILITIES['workspace:read']);
      return environment.run('presence.set', async () => {
        const me = actorId();
        return db.transaction('rw', db.presence, async () => {
          const row: Presence = {
            id: presenceId(me),
            personaId: me,
            status,
            statusText: statusText.trim().slice(0, 80),
            updatedAt: now(),
          };
          await db.presence.put(row);
          return row;
        });
      });
    },

    startHuddle: startHuddleInternal,

    async endHuddle(huddleId: string) {
      session.assert(CAPABILITIES['huddle:start']);
      return environment.run('huddle.end', async () => {
        return db.transaction('rw', db.huddles, db.presence, async () => {
          const huddle = await db.huddles.get(huddleId);
          if (!huddle || huddle.endedAt) return huddle;
          const ended = { ...huddle, endedAt: now() };
          await db.huddles.put(ended);
          const me = actorId();
          await db.presence.put({
            id: presenceId(me),
            personaId: me,
            status: 'online',
            statusText: '',
            updatedAt: now(),
          });
          return ended;
        });
      });
    },

    appendHuddleCaption,

    /**
     * Simulated huddle voice: captions always; optional speechSynthesis via
     * `@protoyard/ai` createVoiceSession. Never opens a cloud speech API.
     * Caption persistence goes through `appendHuddleCaption`.
     */
    createHuddleVoice(huddleId: string): VoiceSession {
      session.assert(CAPABILITIES['huddle:start']);
      return createVoiceSession({
        clock: {
          now: () => clock.now(),
          nowMs: () => clock.nowMs(),
          sleep: async () => {},
        },
        transcripts: [
          'Can everyone hear the demo captions?',
          'Ship checklist looks good on my side.',
          'Let us park the remaining items for tomorrow.',
        ],
        onTranscript: (transcript) => {
          void appendHuddleCaption(huddleId, transcript);
        },
      });
    },

    listBots: () => [...BOTS],
  };
}

export type TeamChatServices = ReturnType<typeof createTeamChatServices>;
