import { MS_PER_DAY, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { Comment, Follow, Notification, Post, Reaction } from '../src/database/schema.ts';
import { feedWindow, mentionsIn, timeline } from '../src/domain/feed.ts';
import { definition } from '../src/prototype.ts';
import { generateSocialWorld, socialTimeline } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const world = (id: string) => generateSocialWorld(contextFor(id));
const rows = <T>(w: WorldSeed, table: string) => (w.tables[table] ?? []) as unknown as T[];
const REF = Date.parse('2026-10-16T15:00:00.000Z');

describe('social generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = world('active');
    expect(world('active')).toEqual(a);
    expect(generateSocialWorld(contextFor('active', 77)).tables.posts).not.toEqual(a.tables.posts);
  });

  it.each(definition.scenarios.map((s) => s.id))(
    '%s passes integrity with consistent counts',
    (id) => {
      const ctx = contextFor(id);
      const w = generateSocialWorld(ctx);
      expect(
        validateWorld(w, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime })
      ).toEqual([]);
      expect(w.memberships.find((m) => m.personaId === ctx.scenario.actor.id)?.role).toBe(
        ctx.scenario.actor.role
      );
      const comments = rows<Comment>(w, 'comments');
      const byPost = new Map<string, number>();
      for (const c of comments) byPost.set(c.postId, (byPost.get(c.postId) ?? 0) + 1);
      for (const p of rows<Post>(w, 'posts')) {
        expect(p.commentCount).toBe(byPost.get(p.id) ?? 0);
        // Plain text only: no markup can come from the generator.
        expect(p.text).not.toMatch(/[<>]/);
      }
      const pairs = rows<Follow>(w, 'follows').map((f) => `${f.followerId}>${f.followeeId}`);
      expect(new Set(pairs).size).toBe(pairs.length);
      const mine = new Set(rows<Reaction>(w, 'reactions').map((r) => `${r.postId}:${r.personId}`));
      expect(mine.size).toBe(rows(w, 'reactions').length);
    }
  );

  it('scales from an empty network to a massive feed of at least 5,000 posts', () => {
    expect(rows(world('empty'), 'posts')).toHaveLength(0);
    expect(rows(world('empty'), 'people')).toHaveLength(27);
    const active = rows<Post>(world('active'), 'posts');
    expect(active.length).toBeGreaterThan(150);
    expect(rows<Post>(world('massive'), 'posts').length).toBeGreaterThanOrEqual(5000);
    expect(active.some((p) => p.media?.kind === 'image')).toBe(true);
  });

  it('seeds an inbox with read and unread notifications aimed at the actor', () => {
    const notes = rows<Notification>(world('active'), 'notifications');
    expect(notes.length).toBeGreaterThan(5);
    expect(notes.every((n) => n.recipientId === 'person_user_0001')).toBe(true);
    expect(notes.some((n) => !n.read)).toBe(true);
    expect(notes.some((n) => n.read)).toBe(true);
  });

  it('delivers activity on the timeline, window-independently, without duplicate follows', async () => {
    const ctx = contextFor('active');
    const w = world('active');
    const read = async (table: string) => rows(w, table) as never[];
    const from = new Date(REF);
    const plus = (d: number) => new Date(REF + d * MS_PER_DAY);
    const once = await socialTimeline({ ...ctx, from, to: plus(3), read });
    const steps = [
      ...(await socialTimeline({ ...ctx, from, to: plus(1), read })),
      ...(await socialTimeline({ ...ctx, from: plus(1), to: plus(2), read })),
      ...(await socialTimeline({ ...ctx, from: plus(2), to: plus(3), read })),
    ];
    expect(once.length).toBeGreaterThan(5);
    expect(steps.map((e) => e.id)).toEqual(once.map((e) => e.id));
    const followers = new Set(
      rows<Follow>(w, 'follows')
        .filter((f) => f.followeeId === 'person_user_0001')
        .map((f) => f.followerId)
    );
    for (const e of once) {
      const n = (e.payload as { notification: Notification }).notification;
      if (n.kind === 'follow') expect(followers.has(n.actorId)).toBe(false);
    }
  });
});

describe('feed rules', () => {
  const post = (id: string, authorId: string, at: number): Post => ({
    id,
    authorId,
    text: 'x',
    media: null,
    createdAt: new Date(REF - at * 60_000).toISOString(),
    reactionCounts: { like: 0, celebrate: 0, insightful: 0 },
    commentCount: 0,
  });

  it('shows the home timeline from followed people and yourself, newest first', () => {
    const posts = [
      post('a', 'me', 30),
      post('b', 'p1', 10),
      post('c', 'p2', 20),
      post('d', 'p1', 5),
    ];
    expect(timeline(posts, 'home', 'me', new Set(['p1'])).map((p) => p.id)).toEqual([
      'd',
      'b',
      'a',
    ]);
    expect(timeline(posts, 'everyone', 'me', new Set()).map((p) => p.id)).toEqual([
      'd',
      'b',
      'c',
      'a',
    ]);
  });

  it('windows a long feed to the rows on screen plus overscan, keeping the total height', () => {
    const heights = Array.from({ length: 6000 }, (_, i) => (i % 3 === 0 ? 240 : 160));
    const total = heights.reduce((s, h) => s + h, 0);
    const w = feedWindow({
      count: 6000,
      heightOf: (i) => heights[i] as number,
      scrollTop: 100_000,
      viewport: 800,
      overscan: 3,
    });
    expect(w.end - w.start).toBeLessThan(20);
    expect(w.total).toBe(total);
    let rendered = 0;
    for (let i = w.start; i < w.end; i++) rendered += heights[i] as number;
    expect(w.before + rendered + w.after).toBe(total);
    expect(w.before).toBeLessThanOrEqual(100_000);
    expect(
      feedWindow({ count: 0, heightOf: () => 100, scrollTop: 0, viewport: 800 })
    ).toMatchObject({ start: 0, end: 0, total: 0 });
  });

  it('finds @mentions in plain text', () => {
    expect(mentionsIn('Thanks @ava_brooks and @Noah_Kim! email me@example.com')).toEqual([
      'ava_brooks',
      'noah_kim',
    ]);
  });
});
