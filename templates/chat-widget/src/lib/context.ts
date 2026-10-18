import type { Persona, PrototypeRuntime } from '@protoyard/core';
import { getRuntime, type LiveQuery, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { ChatDatabase, Conversation } from '../database/schema.ts';
import { SUPPORT_THREAD_ID } from '../database/schema.ts';
import { ASSISTANT } from '../domain/assistant.ts';
import { type ChatServices, createChatServices } from '../domain/chat.ts';

const KEY = Symbol('chat-widget-template');

/** Everything screens need: runtime, database, services and live lists. */
export interface ChatContext {
  runtime: PrototypeRuntime<ChatDatabase>;
  db: ChatDatabase;
  chat: ChatServices;
  people: LiveQuery<Map<string, Persona>>;
  thread: LiveQuery<Conversation | undefined>;
  supportId: string;
}

/** Called once in App.svelte; screens read it with `useChat()`. */
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
  const thread = liveQuery(() => db.conversations.get(SUPPORT_THREAD_ID), {
    deps: () => principal.current?.persona.id,
  });
  const ctx: ChatContext = {
    runtime: rt,
    db,
    chat,
    people,
    thread,
    supportId: SUPPORT_THREAD_ID,
  };
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
