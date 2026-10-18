import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/** Type aliases keep rows assignable to the generic `Row`. */

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type ChannelKind = 'public' | 'private' | 'dm';

export type Channel = {
  id: string;
  workspaceId: string;
  kind: ChannelKind;
  name: string;
  topic: string;
  createdBy: string;
  createdAt: string;
  /** Sorted persona ids for DMs (stable pair key). */
  dmKey: string | null;
  lastMessageAt: string;
};

export type ChannelMember = {
  id: string;
  channelId: string;
  personaId: string;
  role: 'owner' | 'member';
  joinedAt: string;
};

export type Message = {
  id: string;
  channelId: string;
  authorId: string;
  authorKind: 'person' | 'bot';
  body: string;
  at: string;
  /** Parent message id when this is a thread reply. */
  threadId: string | null;
  /** Attachment file id (domain files table), if any. */
  fileId: string | null;
};

export type Reaction = {
  id: string;
  messageId: string;
  emoji: string;
  personaId: string;
  at: string;
};

export type ChatFile = {
  id: string;
  channelId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  at: string;
};

/** Presence is projected from timeline events; rows are the latest state per persona. */
export type Presence = {
  id: string;
  personaId: string;
  status: 'online' | 'away' | 'offline' | 'in-huddle';
  statusText: string;
  updatedAt: string;
};

export type ReadMarker = {
  id: string;
  channelId: string;
  personaId: string;
  lastReadAt: string;
};

export type Huddle = {
  id: string;
  channelId: string;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
  /** Caption lines joined for the simulated huddle (always shown). */
  captions: string;
};

export type TeamChatDatabase = Dexie & {
  workspaces: EntityTable<Workspace, 'id'>;
  channels: EntityTable<Channel, 'id'>;
  channelMembers: EntityTable<ChannelMember, 'id'>;
  messages: EntityTable<Message, 'id'>;
  reactions: EntityTable<Reaction, 'id'>;
  files: EntityTable<ChatFile, 'id'>;
  presence: EntityTable<Presence, 'id'>;
  reads: EntityTable<ReadMarker, 'id'>;
  huddles: EntityTable<Huddle, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        workspaces: 'id, slug',
        channels: 'id, workspaceId, kind, lastMessageAt, dmKey',
        channelMembers: 'id, channelId, personaId, [channelId+personaId]',
        messages: 'id, channelId, [channelId+at], threadId, authorId',
        reactions: 'id, messageId, [messageId+personaId+emoji]',
        files: 'id, channelId, uploadedBy',
        presence: 'id, personaId, status',
        reads: 'id, channelId, personaId, [channelId+personaId]',
        huddles: 'id, channelId, startedAt',
      },
    },
  ],
};

export const DOMAIN_TABLES = [
  'workspaces',
  'channels',
  'channelMembers',
  'messages',
  'reactions',
  'files',
  'presence',
  'reads',
  'huddles',
] as const;

export const readMarkerId = (channelId: string, personaId: string) => `${channelId}:${personaId}`;
export const memberId = (channelId: string, personaId: string) => `${channelId}:${personaId}`;
export const reactionId = (messageId: string, personaId: string, emoji: string) =>
  `${messageId}:${personaId}:${emoji}`;
export const presenceId = (personaId: string) => `presence:${personaId}`;
export const dmKeyFor = (a: string, b: string) => [a, b].sort().join(':');
