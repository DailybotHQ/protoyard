import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `SocialDatabase` below.
 *
 * Relationships: person 1─* post; post 1─* reaction, comment; person *─*
 * person through follows; person 1─* notification (recipient). A person may
 * be a persona of this app (`personaId`) or a simulated member of the network.
 */

export type Person = {
  id: string;
  name: string;
  /** Unique, lowercase, without the @. */
  handle: string;
  bio: string;
  avatarColor: string;
  /** The persona (`py_personas`) this person is, or null for simulated members. */
  personaId: string | null;
};

/** A generated placeholder image: a gradient and a description, never a fetched file. */
export type Media = { kind: 'image'; hue: number; alt: string };

export const REACTIONS = ['like', 'celebrate', 'insightful'] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export type Post = {
  id: string;
  authorId: string;
  /** Plain text. Rendered as text, never as HTML. */
  text: string;
  media: Media | null;
  createdAt: string;
  /** Denormalized counts, updated in the same transaction as the rows. */
  reactionCounts: Record<ReactionKind, number>;
  commentCount: number;
};

export type Reaction = {
  id: string;
  postId: string;
  personId: string;
  kind: ReactionKind;
  createdAt: string;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: string;
};

export type Follow = {
  id: string;
  followerId: string;
  followeeId: string;
  createdAt: string;
};

export const NOTIFICATION_KINDS = ['reaction', 'comment', 'follow', 'mention'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Notification = {
  id: string;
  recipientId: string;
  kind: NotificationKind;
  actorId: string;
  postId: string | null;
  text: string;
  at: string;
  read: boolean;
};

export type SocialDatabase = Dexie & {
  people: EntityTable<Person, 'id'>;
  posts: EntityTable<Post, 'id'>;
  reactions: EntityTable<Reaction, 'id'>;
  comments: EntityTable<Comment, 'id'>;
  follows: EntityTable<Follow, 'id'>;
  notifications: EntityTable<Notification, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        people: 'id, &handle, personaId',
        posts: 'id, authorId, createdAt',
        // [postId+personId] answers "did I react to this post?" without a scan.
        reactions: 'id, postId, personId, [postId+personId]',
        comments: 'id, postId, createdAt',
        follows: 'id, followerId, followeeId, &[followerId+followeeId]',
        // `read` is a boolean, which IndexedDB cannot index: unread filters run on the recipient's rows.
        notifications: 'id, recipientId, at',
      },
    },
  ],
};
