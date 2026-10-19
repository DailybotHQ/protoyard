import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { SocialDatabase } from '../src/database/schema.ts';
import { createServices } from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and opens a new one on the same storage, like a page
 * reload, so these prove persistence, not just in-memory state.
 */

let harness = createHarness<SocialDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<SocialDatabase>(definition);
});
const ME = 'person_user_0001';

describe('social services on the real runtime', () => {
  it('posts plain text, reacts, comments and follows, surviving reloads with counts and notifications', async () => {
    let runtime = await harness.boot('empty');
    let services = createServices(runtime);
    const post = await services.posts.create({
      text: '  Hello <b>world</b>, @ava_brooks!\n\n\n\nBye  ',
      withImage: true,
    });
    // Stored as plain text (trimmed, blank lines collapsed); markup is just characters.
    expect(post.text).toBe('Hello <b>world</b>, @ava_brooks!\n\nBye');
    expect(post.media).toMatchObject({ kind: 'image' });
    expect(await runtime.db.notifications.where('recipientId').equals('person_001').count()).toBe(
      1
    ); // the mention

    expect(await services.reactions.toggle(post.id, 'like')).toBe('like');
    expect(await services.reactions.toggle(post.id, 'celebrate')).toBe('celebrate'); // replaces
    await services.comments.add(post.id, { text: 'First!' });
    expect(await services.follows.toggle('person_002')).toBe(true);

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    const stored = await runtime.db.posts.get(post.id);
    expect(stored).toMatchObject({
      commentCount: 1,
      reactionCounts: { like: 0, celebrate: 1, insightful: 0 },
    });
    expect(await services.reactions.toggle(post.id, 'celebrate')).toBeNull(); // same again removes
    expect((await runtime.db.posts.get(post.id))?.reactionCounts.celebrate).toBe(0);
    expect(await services.follows.toggle('person_002')).toBe(false);
    expect(await runtime.db.follows.count()).toBe(0);
    await expect(services.follows.toggle(ME)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects empty and over-long text with field errors', async () => {
    const runtime = await harness.boot('empty');
    const services = createServices(runtime);
    const empty = await services.posts.create({ text: '   \n ' }).catch((e: unknown) => e);
    expect((empty as ValidationError).issues.text).toMatch(/Write something/);
    const long = await services.posts.create({ text: 'x'.repeat(501) }).catch((e: unknown) => e);
    expect((long as ValidationError).issues.text).toMatch(/500/);
    expect(await runtime.db.posts.count()).toBe(0);
  });

  it('lets authors delete their posts, moderators delete any, and members nobody else’s', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const others = await runtime.db.posts.filter((p) => p.authorId !== ME).first();
    if (!others) throw new Error('posts by others');
    await expect(services.posts.remove(others.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    const mine = await services.posts.create({ text: 'Temporary' });
    await services.comments.add(mine.id, { text: 'note' });
    await services.posts.remove(mine.id);
    expect(await runtime.db.posts.get(mine.id)).toBeUndefined();
    expect(await runtime.db.comments.where('postId').equals(mine.id).count()).toBe(0);

    await runtime.session.switchActor('user_0002'); // moderator
    await services.posts.remove(others.id);
    expect(await runtime.db.posts.get(others.id)).toBeUndefined();
  });

  it('keeps the viewer read-only and writes nothing offline', async () => {
    const runtime = await harness.boot('viewer');
    const services = createServices(runtime);
    const post = await runtime.db.posts.toCollection().first();
    if (!post) throw new Error('posts');
    for (const attempt of [
      services.posts.create({ text: 'Nope' }),
      services.reactions.toggle(post.id, 'like'),
      services.comments.add(post.id, { text: 'Nope' }),
      services.follows.toggle('person_001'),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(PermissionDeniedError);
    }
    await runtime.session.switchActor('user_0001');
    const before = await runtime.db.posts.count();
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(services.posts.create({ text: 'Offline' })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    await expect(services.reactions.toggle(post.id, 'like')).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await runtime.db.posts.count()).toBe(before);
  });

  it('marks notifications read, one or all', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const unread = async () =>
      (await runtime.db.notifications.where('recipientId').equals(ME).toArray()).filter(
        (n) => !n.read
      );
    const first = (await unread())[0];
    if (!first) throw new Error('unread notifications');
    expect(await services.notifications.markRead(first.id)).toBe(1);
    const remaining = (await unread()).length;
    expect(remaining).toBeGreaterThan(0);
    expect(await services.notifications.markRead()).toBe(remaining);
    expect(await unread()).toHaveLength(0);
  });

  it('fills the inbox and the actor’s posts when simulated time advances', async () => {
    const runtime = await harness.boot('active');
    const before = await runtime.db.notifications.count();
    await runtime.scenarios.advance({ days: 2 });
    expect(await runtime.db.notifications.count()).toBeGreaterThan(before);
  });

  it('loads every scenario, including the massive feed', async () => {
    for (const id of definition.manifest.scenarios) {
      const runtime = await harness.boot(id);
      expect(await runtime.db.people.count(), id).toBe(27);
      if (id === 'massive') expect(await runtime.db.posts.count()).toBeGreaterThanOrEqual(5000);
      harness.closeAll();
      harness = createHarness<SocialDatabase>(definition);
    }
  }, 90_000);
});
