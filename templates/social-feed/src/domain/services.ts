import { createRuntimeId, PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import type {
  Comment,
  Notification,
  Person,
  Post,
  ReactionKind,
  SocialDatabase,
} from '../database/schema.ts';
import { EMPTY_COUNTS, mentionsIn } from './feed.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type CommentInput,
  CommentInputSchema,
  type PostInput,
  PostInputSchema,
  parse,
  ReactionKindSchema,
  ValidationError,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes every related row in ONE Dexie transaction (row + counts + notifications).
 * The acting person is the network member whose `personaId` is the active persona.
 */

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have been deleted in another tab.`);
    this.name = 'NotFoundError';
  }
}

const HUES = [12, 48, 160, 205, 262, 320];

export function createServices(runtime: PrototypeRuntime<SocialDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  /** The person record of the active persona (inside a transaction that includes `people`). */
  const me = async (): Promise<Person> => {
    const personaId = session.principal()?.persona.id;
    if (!personaId) throw new Error('No active persona. Load a scenario first.');
    const person = await db.people.where('personaId').equals(personaId).first();
    if (!person) throw new Error('The active persona has no profile in this network.');
    return person;
  };
  const notify = (
    recipientId: string,
    kind: Notification['kind'],
    actor: Person,
    postId: string | null,
    text: string
  ): Notification => ({
    id: createRuntimeId('notification'),
    recipientId,
    kind,
    actorId: actor.id,
    postId,
    text,
    at: now(),
    read: false,
  });

  return {
    posts: {
      /** Publishes a post; `@handle` mentions notify those people. */
      async create(input: PostInput): Promise<Post> {
        session.assert(CAPABILITIES.postsCreate);
        const data = parse(PostInputSchema, input);
        return environment.run('posts.create', () =>
          db.transaction('rw', db.people, db.posts, db.notifications, async () => {
            const author = await me();
            const post: Post = {
              id: createRuntimeId('post'),
              authorId: author.id,
              text: data.text,
              media: data.withImage
                ? {
                    kind: 'image',
                    hue: HUES[data.text.length % HUES.length] as number,
                    alt: `Placeholder image for ${author.name}'s post`,
                  }
                : null,
              createdAt: now(),
              reactionCounts: { ...EMPTY_COUNTS },
              commentCount: 0,
            };
            await db.posts.add(post);
            for (const handle of mentionsIn(data.text)) {
              const mentioned = await db.people.where('handle').equals(handle).first();
              if (mentioned && mentioned.id !== author.id) {
                await db.notifications.add(
                  notify(mentioned.id, 'mention', author, post.id, `${author.name} mentioned you`)
                );
              }
            }
            return post;
          })
        );
      },

      /** Authors delete their own posts; moderators delete any. Reactions, comments and notifications go too. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.postsCreate);
        await environment.run('posts.remove', () =>
          db.transaction(
            'rw',
            [db.people, db.posts, db.reactions, db.comments, db.notifications],
            async () => {
              const post = await db.posts.get(id);
              if (!post) return;
              const author = await me();
              if (post.authorId !== author.id && !session.can(CAPABILITIES.postsModerate)) {
                throw new PermissionDeniedError(
                  CAPABILITIES.postsModerate,
                  session.principal()?.role ?? null
                );
              }
              await db.reactions.where('postId').equals(id).delete();
              await db.comments.where('postId').equals(id).delete();
              await db.notifications.filter((n) => n.postId === id).delete();
              await db.posts.delete(id);
            }
          )
        );
      },
    },

    reactions: {
      /**
       * One reaction per person per post: the same kind again removes it, another
       * kind replaces it. Counts change in the same transaction.
       */
      async toggle(postId: string, kind: ReactionKind): Promise<ReactionKind | null> {
        session.assert(CAPABILITIES.interact);
        const reaction = parse(ReactionKindSchema, kind);
        return environment.run('reactions.toggle', () =>
          db.transaction('rw', [db.people, db.posts, db.reactions, db.notifications], async () => {
            const post = await db.posts.get(postId);
            if (!post) throw new NotFoundError('post');
            const person = await me();
            const existing = await db.reactions
              .where('[postId+personId]')
              .equals([postId, person.id])
              .first();
            const counts = { ...post.reactionCounts };
            if (existing) {
              counts[existing.kind] = Math.max(0, counts[existing.kind] - 1);
              await db.reactions.delete(existing.id);
            }
            const result = existing?.kind === reaction ? null : reaction;
            if (result) {
              counts[result] += 1;
              await db.reactions.add({
                id: createRuntimeId('reaction'),
                postId,
                personId: person.id,
                kind: result,
                createdAt: now(),
              });
              if (!existing && post.authorId !== person.id) {
                await db.notifications.add(
                  notify(
                    post.authorId,
                    'reaction',
                    person,
                    postId,
                    `${person.name} reacted to your post`
                  )
                );
              }
            }
            await db.posts.put({ ...post, reactionCounts: counts });
            return result;
          })
        );
      },
    },

    comments: {
      async add(postId: string, input: CommentInput): Promise<Comment> {
        session.assert(CAPABILITIES.interact);
        const data = parse(CommentInputSchema, input);
        return environment.run('comments.add', () =>
          db.transaction('rw', [db.people, db.posts, db.comments, db.notifications], async () => {
            const post = await db.posts.get(postId);
            if (!post) throw new NotFoundError('post');
            const author = await me();
            const comment: Comment = {
              id: createRuntimeId('comment'),
              postId,
              authorId: author.id,
              text: data.text,
              createdAt: now(),
            };
            await db.comments.add(comment);
            await db.posts.put({ ...post, commentCount: post.commentCount + 1 });
            if (post.authorId !== author.id) {
              await db.notifications.add(
                notify(
                  post.authorId,
                  'comment',
                  author,
                  postId,
                  `${author.name} commented on your post`
                )
              );
            }
            return comment;
          })
        );
      },
    },

    follows: {
      /** Follows or unfollows; returns whether you follow them afterwards. */
      async toggle(personId: string): Promise<boolean> {
        session.assert(CAPABILITIES.interact);
        return environment.run('follows.toggle', () =>
          db.transaction('rw', db.people, db.follows, db.notifications, async () => {
            const target = await db.people.get(personId);
            if (!target) throw new NotFoundError('person');
            const self = await me();
            if (target.id === self.id)
              throw new ValidationError({ personId: 'You cannot follow yourself' });
            const existing = await db.follows
              .where('[followerId+followeeId]')
              .equals([self.id, personId])
              .first();
            if (existing) {
              await db.follows.delete(existing.id);
              return false;
            }
            await db.follows.add({
              id: createRuntimeId('follow'),
              followerId: self.id,
              followeeId: personId,
              createdAt: now(),
            });
            await db.notifications.add(
              notify(personId, 'follow', self, null, `${self.name} followed you`)
            );
            return true;
          })
        );
      },
    },

    notifications: {
      /** Marks one (or, without an id, every) notification of yours as read. */
      async markRead(id?: string): Promise<number> {
        session.assert(CAPABILITIES.interact);
        return environment.run('notifications.read', () =>
          db.transaction('rw', db.people, db.notifications, async () => {
            const self = await me();
            const mine = (
              await db.notifications.where('recipientId').equals(self.id).toArray()
            ).filter((n) => !n.read && (id === undefined || n.id === id));
            for (const n of mine) await db.notifications.put({ ...n, read: true });
            return mine.length;
          })
        );
      },
    },
  };
}

export type SocialServices = ReturnType<typeof createServices>;
