// @vitest-environment node
import type { ReviewCommentInput } from '@protoyard/core/review';
import { describe, expect, it, vi } from 'vitest';
import {
  ArtifactReviewError,
  createArtifactReviewAdapter,
  createArtifactReviewAdapterFromCapabilities,
  LOCAL_REVIEW_FALLBACK_NOTICE,
} from '../src/adapters/artifact.ts';
import { createMemoryReviewAdapter } from '../src/store/index.ts';
import { runAdapterConformance, sampleComment } from './conformance.ts';
import { createFakeClaude } from './fixtures/fake-claude.ts';

const makeAdapter = () => {
  const fake = createFakeClaude({
    profiles: { 'user-reviewer-001': { displayName: 'Mira Reviewer' } },
  });
  return createArtifactReviewAdapterFromCapabilities(fake.db, fake.user);
};

runAdapterConformance('artifact', makeAdapter);

describe('artifact ReviewAdapter', () => {
  it('falls back when Claude or either capability is unavailable', async () => {
    const fallback = createMemoryReviewAdapter();
    expect(await createArtifactReviewAdapter(fallback, undefined)).toBe(fallback);
    expect(LOCAL_REVIEW_FALLBACK_NOTICE).toBe('Comments are saved only in your browser here');

    const noDatabase = createFakeClaude({ useNull: { db: true } });
    expect(await createArtifactReviewAdapter(fallback, noDatabase.claude)).toBe(fallback);
    expect(noDatabase.uses.sort()).toEqual(['db', 'user']);

    const noUser = createFakeClaude({ useNull: { user: true } });
    expect(await createArtifactReviewAdapter(fallback, noUser.claude)).toBe(fallback);

    const rejected = createFakeClaude({ useError: { db: { code: 'revoked' } } });
    expect(await createArtifactReviewAdapter(fallback, rejected.claude)).toBe(fallback);
  });

  it('stores author ids only and resolves display names from profiles with a Someone fallback', async () => {
    const fake = createFakeClaude({
      profiles: {
        'user-reviewer-001': { displayName: 'Mira' },
        'user-unknown-002': { displayName: '' },
      },
    });
    const adapter = createArtifactReviewAdapterFromCapabilities(fake.db, fake.user);
    const root = sampleComment('review-demo');
    const saved = await adapter.put(root);

    const stored = fake.values.get(`review/review-demo/threads/${root.id}`);
    expect(stored).toMatchObject({
      authorId: 'user-reviewer-001',
      text: root.body,
      route: root.anchor?.route,
    });
    expect(stored).not.toHaveProperty('author');
    expect(stored).not.toHaveProperty('authorName');
    expect(saved.author.name).toBe('Mira');

    fake.values.set(`review/review-demo/threads/${root.id}`, {
      ...stored,
      authorId: 'user-unknown-002',
    });
    const [read] = await adapter.list('review-demo');
    expect(read?.author.name).toBe('Someone');
    expect(fake.profileRequests.at(-1)).toEqual(['user-unknown-002']);
  });

  it('stores replies in their thread collection and deletes a root with its replies', async () => {
    const fake = createFakeClaude();
    const adapter = createArtifactReviewAdapterFromCapabilities(fake.db, fake.user);
    const root = sampleComment('review-demo');
    const reply: ReviewCommentInput = {
      ...sampleComment('review-demo', {
        id: 'reply0000001',
        threadId: root.id,
        anchor: undefined,
        context: undefined,
        body: 'I can reproduce this.',
      }),
    };
    await adapter.put(root);
    await adapter.put(reply);

    expect(fake.values.has(`review/review-demo/threads/${root.id}/replies/${reply.id}`)).toBe(true);
    expect((await adapter.list('review-demo')).map((comment) => comment.id)).toEqual([
      root.id,
      reply.id,
    ]);

    await adapter.remove(root.id);
    expect(fake.values.has(`review/review-demo/threads/${root.id}`)).toBe(false);
    expect(fake.values.has(`review/review-demo/threads/${root.id}/replies/${reply.id}`)).toBe(
      false
    );
    await adapter.remove(root.id);
  });

  it('keeps at most 64 live collection subscriptions and unsubscribes on close', async () => {
    const fake = createFakeClaude();
    const adapter = createArtifactReviewAdapterFromCapabilities(fake.db, fake.user);
    const first = sampleComment('review-live');
    const second = sampleComment('review-live');
    await adapter.put(first);
    await adapter.put(second);

    const onChange = vi.fn();
    const unsubscribe = adapter.subscribe?.('review-live', onChange);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.activeSubscriptions).toBe(3);
    expect(fake.maxActiveSubscriptions).toBeLessThanOrEqual(64);

    const reply = sampleComment('review-live', {
      id: 'reply-live-0001',
      threadId: first.id,
      anchor: undefined,
      context: undefined,
    });
    await adapter.put(reply);
    expect(onChange).toHaveBeenCalled();

    unsubscribe?.();
    expect(fake.activeSubscriptions).toBe(0);
  });

  it('gates writes and makes invalid_argument read-only for the rest of the visit', async () => {
    const denied = createFakeClaude({ canWrite: false });
    const deniedAdapter = createArtifactReviewAdapterFromCapabilities(denied.db, denied.user);
    expect(deniedAdapter.canWrite()).toBe(false);
    await expect(deniedAdapter.put(sampleComment('review-denied'))).rejects.toMatchObject({
      code: 'forbidden',
    });

    const invalid = createFakeClaude({ canError: { code: 'invalid_argument' } });
    const invalidAdapter = createArtifactReviewAdapterFromCapabilities(invalid.db, invalid.user);
    expect(invalidAdapter.canWrite()).toBe(false);
    expect(invalidAdapter.canWrite()).toBe(false);
    expect(invalid.canCalls).toBe(1);
  });

  it('keeps null permission undecided and retries a transient storage error only on another call', async () => {
    const fake = createFakeClaude({ canWrite: null, writeError: { code: 'unavailable' } });
    const adapter = createArtifactReviewAdapterFromCapabilities(fake.db, fake.user);
    expect(adapter.canWrite()).toBeNull();
    const comment = sampleComment('review-retry');
    await expect(adapter.put(comment)).rejects.toMatchObject<Partial<ArtifactReviewError>>({
      code: 'unavailable',
      retryFromGesture: true,
    });
    expect(fake.writes.set).toBe(0);

    fake.options.writeError = undefined;
    await adapter.put(comment);
    expect(fake.writes.set).toBe(1);
  });

  it('serializes concurrent writes to the same document', async () => {
    const fake = createFakeClaude({ writeDelayMs: 5 });
    const adapter = createArtifactReviewAdapterFromCapabilities(fake.db, fake.user);
    const root = sampleComment('review-serial');
    const results = await Promise.all([
      adapter.put(root),
      adapter.put({ ...root, body: 'First edit.' }),
      adapter.put({ ...root, body: 'Final edit.' }),
    ]);
    const stored = fake.values.get(`review/review-serial/threads/${root.id}`);

    expect(fake.maxConcurrentWrites).toBe(1);
    expect(stored?.text).toBe('Final edit.');
    expect(Date.parse(results[2]?.updatedAt ?? '')).toBeGreaterThan(
      Date.parse(results[1]?.updatedAt ?? '')
    );
  });
});
