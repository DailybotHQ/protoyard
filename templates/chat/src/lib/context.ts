import type { Persona, PrototypeRuntime } from '@protoyard/core';
import { getRuntime, type LiveQuery, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { ChatDatabase, Conversation } from '../database/schema.ts';
import { ASSISTANT } from '../domain/assistant.ts';
import { type ChatServices, createChatServices } from '../domain/chat.ts';

const KEY = Symbol('chat-template');

export interface InboxItem extends Conversation {
  unread: number;
  preview: string;
}

/** Everything screens need: the runtime, the typed database, services and two live lists. */
export interface ChatContext {
  runtime: PrototypeRuntime<ChatDatabase>;
  db: ChatDatabase;
  chat: ChatServices;
  /** Personas by id, kept live. */
  people: LiveQuery<Map<string, Persona>>;
  /** Conversations, most recent first, with unread counts for the active persona. */
  inbox: LiveQuery<InboxItem[]>;
}

/** Called once in App.svelte (component init); screens read it with `useChat()`. */
export function provideChat(runtime?: PrototypeRuntime<ChatDatabase>): ChatContext {
  const rt = runtime ?? getRuntime<ChatDatabase>();
  const db = rt.db;
  const chat = createChatServices(rt);
  const principal = usePrincipal(rt);
  const people = liveQuery(
    async () =>
      new Map(((await db.table('py_personas').toArray()) as Persona[]).map((p) => [p.id, p])),
    { initial: new Map<string, Persona>() }
  );
  const inbox = liveQuery(
    async (): Promise<InboxItem[]> => {
      const me = rt.session.principal()?.persona.id;
      const conversations = await db.conversations.orderBy('lastMessageAt').reverse().toArray();
      return Promise.all(
        conversations.map(async (c) => {
          const last = await db.messages
            .where('[conversationId+at]')
            .between([c.id, ''], [c.id, '￿'])
            .last();
          return {
            ...c,
            unread: me ? await chat.unreadCount(c.id, me) : 0,
            preview: last ? last.body || (last.status === 'failed' ? 'Reply failed' : '…') : '',
          };
        })
      );
    },
    // Dexie runs queriers outside Svelte tracking: reactive inputs go in `deps`.
    { initial: [], deps: () => principal.current?.persona.id }
  );
  const ctx: ChatContext = { runtime: rt, db, chat, people, inbox };
  setContext(KEY, ctx);
  return ctx;
}

export function useChat(): ChatContext {
  const ctx = getContext<ChatContext | undefined>(KEY);
  if (!ctx) throw new Error('useChat() must be used inside App.svelte');
  return ctx;
}

export interface Author {
  name: string;
  color: string;
  isAssistant: boolean;
}

export function authorOf(people: Map<string, Persona> | undefined, id: string): Author {
  if (id === ASSISTANT.id)
    return { name: ASSISTANT.name, color: ASSISTANT.color, isAssistant: true };
  const person = people?.get(id);
  return {
    name: person?.name ?? 'Former member',
    color: person?.avatarColor ?? '#64748b',
    isAssistant: false,
  };
}
