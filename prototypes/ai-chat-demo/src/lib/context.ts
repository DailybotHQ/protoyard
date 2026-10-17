import type { Persona, PrototypeRuntime } from '@protoyard/core';
import { getRuntime, type LiveQuery, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import Dexie from 'dexie';
import { getContext, setContext } from 'svelte';
import type { Agent, ChatDatabase, Conversation } from '../database/schema.ts';
import { type ChatServices, createChatServices } from '../domain/services.ts';
import { plainText } from './markdown.ts';
import { sortConversations } from './thread.ts';

const KEY = Symbol('relay');

export interface Directory {
  people: Map<string, Persona>;
  agents: Map<string, Agent>;
}

export interface InboxItem extends Conversation {
  unread: number;
  preview: string;
  previewAuthorId: string | null;
  agentIds: string[];
}

export interface Chat {
  runtime: PrototypeRuntime<ChatDatabase>;
  db: ChatDatabase;
  services: ChatServices;
  /** Everyone who can author a message (people + agents), kept live. */
  directory: LiveQuery<Directory>;
  /** Conversations the active persona belongs to (archived included), sorted. */
  inbox: LiveQuery<InboxItem[]>;
}

/** Called once in App.svelte (component init); screens read it with `useChat()`. */
export function provideChat(): Chat {
  const runtime = getRuntime() as unknown as PrototypeRuntime<ChatDatabase>;
  const principal = usePrincipal();
  const directory = liveQuery(
    async (): Promise<Directory> => {
      const [people, agents] = await Promise.all([
        runtime.db.table('py_personas').toArray() as Promise<Persona[]>,
        runtime.db.agents.toArray(),
      ]);
      return {
        people: new Map(people.map((p) => [p.id, p])),
        agents: new Map(agents.map((a) => [a.id, a])),
      };
    },
    { initial: { people: new Map(), agents: new Map() } }
  );
  const services = createChatServices(runtime);
  const db = runtime.db;
  const inbox = liveQuery(
    async (): Promise<InboxItem[]> => {
      const me = runtime.session.principal()?.persona.id;
      if (!me) return [];
      const mine = await db.participants.where('memberId').equals(me).toArray();
      const ids = mine.map((p) => p.conversationId);
      const [conversations, members] = await Promise.all([
        db.conversations.bulkGet(ids),
        db.participants.where('conversationId').anyOf(ids).toArray(),
      ]);
      const items = await Promise.all(
        conversations
          .filter((c): c is Conversation => Boolean(c))
          .map(async (c): Promise<InboxItem> => {
            const [unread, last] = await Promise.all([
              services.unreadCount(c.id, me),
              db.messages
                .where('[conversationId+at]')
                .between([c.id, Dexie.minKey], [c.id, Dexie.maxKey])
                .last(),
            ]);
            return {
              ...c,
              unread,
              preview: last ? plainText(last.body, 90) : '',
              previewAuthorId: last?.authorId ?? null,
              agentIds: members
                .filter((m) => m.conversationId === c.id && m.memberKind === 'agent')
                .map((m) => m.memberId),
            };
          })
      );
      return sortConversations(items);
    },
    { initial: [], deps: () => principal.current?.persona.id }
  );
  const chat: Chat = { runtime, db, services, directory, inbox };
  setContext(KEY, chat);
  return chat;
}

export function useChat(): Chat {
  const chat = getContext<Chat | undefined>(KEY);
  if (!chat) throw new Error('useChat() must be used inside App.svelte');
  return chat;
}

export interface Author {
  id: string;
  name: string;
  color: string;
  kind: 'person' | 'agent';
  subtitle: string;
}

/** Display info for any author id, with a graceful fallback for removed people. */
export function authorOf(directory: Directory | undefined, id: string): Author {
  const agent = directory?.agents.get(id);
  if (agent)
    return { id, name: agent.name, color: agent.color, kind: 'agent', subtitle: 'AI agent' };
  const person = directory?.people.get(id);
  return {
    id,
    name: person?.name ?? 'Former member',
    color: person?.avatarColor ?? '#64748b',
    kind: 'person',
    subtitle: person?.title ?? '',
  };
}
