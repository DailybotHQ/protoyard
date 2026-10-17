import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `ChatDatabase` below.
 *
 * People are the platform personas (`py_personas`). The assistant is not a
 * row: it is the constant `ASSISTANT` in `domain/assistant.ts`.
 */

/** Type aliases (not interfaces) keep rows assignable to the generic `Row`. */
export type Conversation = {
  id: string;
  title: string;
  /** Persona id (`py_personas`). */
  createdBy: string;
  createdAt: string;
  lastMessageAt: string;
};

export type MessageStatus = 'sent' | 'streaming' | 'failed' | 'stopped';

export type Message = {
  id: string;
  conversationId: string;
  /** A persona id, or `ASSISTANT.id`. */
  authorId: string;
  authorKind: 'person' | 'assistant';
  body: string;
  at: string;
  status: MessageStatus;
  /** For assistant replies: the message being answered (used by retry). */
  promptId: string | null;
  /** Why an assistant reply failed. */
  error: string | null;
};

/** One row per (conversation, person): messages after `lastReadAt` are unread. */
export type ReadMarker = {
  id: string;
  conversationId: string;
  personaId: string;
  lastReadAt: string;
};

export type ChatDatabase = Dexie & {
  conversations: EntityTable<Conversation, 'id'>;
  messages: EntityTable<Message, 'id'>;
  reads: EntityTable<ReadMarker, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        conversations: 'id, createdBy, lastMessageAt',
        messages: 'id, conversationId, [conversationId+at], authorId, status',
        reads: 'id, conversationId, personaId',
      },
    },
  ],
};

/** Read markers use a predictable id so marking read is a single `put`. */
export const readMarkerId = (conversationId: string, personaId: string) =>
  `${conversationId}:${personaId}`;
