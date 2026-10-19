import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import {
  database,
  type Follow,
  type Notification,
  type Post,
  type ReactionKind,
} from './database/schema.ts';
import { policy } from './domain/policy.ts';
import {
  generateSocialWorld,
  SOCIAL_GENERATOR_VERSION,
  socialTimeline,
} from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to the social feed's schema, policy, scenarios,
 * generator and timeline. Read this file first: schema → policy → scenarios →
 * generator → services (src/domain/services.ts) → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateSocialWorld,
  generatorVersion: SOCIAL_GENERATOR_VERSION,
  timeline: socialTimeline,
  // Activity from the timeline: the notification, plus the reaction, comment or follow it describes.
  applyEvent: async (event, ctx) => {
    const { notification, comment, reaction } = event.payload as {
      notification: Notification;
      comment: string;
      reaction: ReactionKind;
    };
    if (!notification) return;
    await ctx.put('notifications', notification);
    const post = notification.postId
      ? ((await ctx.get('posts', notification.postId)) as Post | undefined)
      : undefined;
    if (notification.kind === 'reaction' && post) {
      await ctx.put('reactions', {
        id: `reaction:${event.id}`,
        postId: post.id,
        personId: notification.actorId,
        kind: reaction,
        createdAt: event.at,
      });
      await ctx.put('posts', {
        ...post,
        reactionCounts: { ...post.reactionCounts, [reaction]: post.reactionCounts[reaction] + 1 },
      });
    } else if (notification.kind === 'comment' && post) {
      await ctx.put('comments', {
        id: `comment:${event.id}`,
        postId: post.id,
        authorId: notification.actorId,
        text: comment,
        createdAt: event.at,
      });
      await ctx.put('posts', { ...post, commentCount: post.commentCount + 1 });
    } else if (notification.kind === 'follow') {
      const follow: Follow = {
        id: `follow:${event.id}`,
        followerId: notification.actorId,
        followeeId: notification.recipientId,
        createdAt: event.at,
      };
      await ctx.put('follows', follow);
    }
  },
  integrity: {
    relations: {
      people: { personaId: 'py_personas' },
      posts: { authorId: 'people' },
      reactions: { postId: 'posts', personId: 'people' },
      comments: { postId: 'posts', authorId: 'people' },
      follows: { followerId: 'people', followeeId: 'people' },
      notifications: { recipientId: 'people', actorId: 'people', postId: 'posts' },
    },
    timestamps: {
      posts: ['createdAt'],
      reactions: ['createdAt'],
      comments: ['createdAt'],
      follows: ['createdAt'],
      notifications: ['at'],
    },
  },
});
