import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Relay data model. Humans are the platform personas (`py_personas`); AI
 * agents are rows in `agents`. A message author is either kind. Agent replies
 * are produced by scripted, deterministic "runs" — there is no model API.
 */

export interface Agent {
  id: string;
  name: string;
  handle: string;
  description: string;
  color: string;
  /** Simulated tokens per second while streaming. */
  speed: number;
  skills: string[];
}

export interface Conversation {
  id: string;
  title: string;
  kind: 'channel' | 'direct';
  createdBy: string;
  createdAt: string;
  lastMessageAt: string;
  pinned: boolean;
  archived: boolean;
}

export interface Participant {
  id: string;
  conversationId: string;
  memberId: string;
  memberKind: 'person' | 'agent';
  /** Messages after this instant are unread for that person. */
  lastReadAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  authorKind: 'person' | 'agent';
  body: string;
  at: string;
  status: 'sent' | 'streaming' | 'failed';
  runId: string | null;
}

export interface AgentRun {
  id: string;
  conversationId: string;
  agentId: string;
  promptMessageId: string;
  status: 'streaming' | 'done' | 'error' | 'cancelled';
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  tokens: number;
}

export type ChatDatabase = Dexie & {
  agents: EntityTable<Agent, 'id'>;
  conversations: EntityTable<Conversation, 'id'>;
  participants: EntityTable<Participant, 'id'>;
  messages: EntityTable<Message, 'id'>;
  runs: EntityTable<AgentRun, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        agents: 'id, handle',
        conversations: 'id, kind, lastMessageAt, archived, createdBy',
        participants: 'id, conversationId, memberId, [conversationId+memberId]',
        messages: 'id, conversationId, authorId, at, [conversationId+at], status',
        runs: 'id, conversationId, agentId, status',
      },
    },
  ],
};
