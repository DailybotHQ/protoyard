import type { ReviewComment, ReviewCommentInput } from '@protoyard/core/review';
import { describe, expect, it } from 'vitest';
import { type ReviewAdapter, watchReviewComments } from '../src/store/index.ts';

/**
 * The behavior every `ReviewAdapter` must have. Run it from a backend's own
 * test file:
 *
 *   runAdapterConformance('artifact adapter', () => createArtifactReviewAdapter(db));
 *
 * Each case gets a fresh adapter and its own slug, so a persistent backend
 * can share storage between cases.
 */
export interface ConformanceOptions {
  /** Polling interval used for adapters without live `subscribe` (default 25 ms). */
  pollIntervalMs?: number;
  /** How long to wait for a change notification (default 2,000 ms). */
  timeoutMs?: number;
  /** Called after each case (close databases, clear tables). */
  cleanup?: (adapter: ReviewAdapter) => void | Promise<void>;
}

let sequence = 0;
const unique = () => `${Date.now().toString(36)}${(sequence++).toString(36).padStart(4, '0')}`;

/** A valid thread root for `slug` (override any field). */
export function sampleComment(
  slug: string,
  overrides: Partial<ReviewCommentInput> = {}
): ReviewCommentInput {
  const id = overrides.id ?? `c${unique()}`.padEnd(12, '0');
  return {
    id,
    threadId: id,
    slug,
    body: 'The total looks off on this card.',
    author: { name: 'Riley Reviewer', clientId: 'client-conformance' },
    createdAt: '2026-10-19T10:00:00.000Z',
    anchor: {
      route: { pattern: '/deals/:id', path: '/deals/7' },
      locators: [{ kind: 'py-anchor', value: 'deal-total' }],
      fingerprint: '$12,000',
      offset: { x: 0.5, y: 0.25 },
    },
    context: { scenario: 'busy-quarter', viewport: { width: 1280, height: 800 } },
    ...overrides,
  };
}

const without = (c: ReviewComment) => {
  const { updatedAt: _stamp, ...rest } = c;
  return rest;
};

export function runAdapterConformance(
  name: string,
  makeAdapter: () => ReviewAdapter | Promise<ReviewAdapter>,
  options: ConformanceOptions = {}
): void {
  const timeoutMs = options.timeoutMs ?? 2000;
  const withAdapter = (fn: (adapter: ReviewAdapter, slug: string) => Promise<void>) => async () => {
    const adapter = await makeAdapter();
    try {
      await fn(adapter, `conformance-${unique()}`);
    } finally {
      await options.cleanup?.(adapter);
    }
  };

  describe(`ReviewAdapter conformance: ${name}`, () => {
    it(
      'describes itself',
      withAdapter(async (adapter) => {
        const info = adapter.info();
        expect(['local', 'cloudflare', 'http', 'artifact']).toContain(info.kind);
        expect(typeof info.shared).toBe('boolean');
        expect(typeof info.live).toBe('boolean');
        if (info.live) expect(typeof adapter.subscribe).toBe('function');
      })
    );

    it(
      'round-trips a comment and stamps updatedAt',
      withAdapter(async (adapter, slug) => {
        const input = sampleComment(slug);
        const stored = await adapter.put(input);
        expect(stored.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        const listed = await adapter.list(slug);
        expect(listed).toHaveLength(1);
        expect(without(listed[0] as ReviewComment)).toEqual(without(stored));
        expect(listed[0]).toMatchObject({
          id: input.id,
          body: input.body,
          anchor: input.anchor,
          context: input.context,
        });
        // A stale client stamp is replaced: the adapter owns updatedAt.
        const forged = await adapter.put({ ...input, updatedAt: '2000-01-01T00:00:00.000Z' });
        expect(Date.parse(forged.updatedAt as string)).toBeGreaterThan(
          Date.parse('2000-01-01T00:00:00.000Z')
        );
      })
    );

    it(
      'upserts by id: edit, resolve and reopen are puts of the whole comment, last write wins',
      withAdapter(async (adapter, slug) => {
        const root = sampleComment(slug);
        const first = await adapter.put(root);
        const edited = await adapter.put({
          ...root,
          body: 'Edited: the total is right.',
          editedAt: '2026-10-19T10:05:00.000Z',
        });
        expect(Date.parse(edited.updatedAt as string)).toBeGreaterThan(
          Date.parse(first.updatedAt as string)
        );
        await adapter.put({
          ...root,
          body: 'Edited: the total is right.',
          resolvedAt: '2026-10-19T10:06:00.000Z',
          resolvedBy: root.author,
        });
        let listed = await adapter.list(slug);
        expect(listed).toHaveLength(1);
        expect(listed[0]).toMatchObject({
          body: 'Edited: the total is right.',
          resolvedAt: '2026-10-19T10:06:00.000Z',
        });
        // Reopen: the whole document without resolvedAt.
        await adapter.put({ ...root, body: 'Edited: the total is right.' });
        listed = await adapter.list(slug);
        expect(listed[0]?.resolvedAt).toBeUndefined();
        // Putting the same document again changes nothing but the stamp.
        await adapter.put({ ...root, body: 'Edited: the total is right.' });
        expect(await adapter.list(slug)).toHaveLength(1);
      })
    );

    it(
      'removes a comment, and removing a missing id still resolves',
      withAdapter(async (adapter, slug) => {
        const a = await adapter.put(sampleComment(slug));
        const b = await adapter.put(sampleComment(slug, { createdAt: '2026-10-19T11:00:00.000Z' }));
        await adapter.remove(a.id);
        expect((await adapter.list(slug)).map((c) => c.id)).toEqual([b.id]);
        await expect(adapter.remove(a.id)).resolves.toBeUndefined();
        await expect(adapter.remove('missing-id-0000')).resolves.toBeUndefined();
      })
    );

    it(
      'lists one slug, oldest first, then by id, with replies',
      withAdapter(async (adapter, slug) => {
        const late = sampleComment(slug, { createdAt: '2026-10-19T12:00:00.000Z' });
        const early = sampleComment(slug, { createdAt: '2026-10-19T09:00:00.000Z' });
        const tieA = sampleComment(slug, {
          id: 'tie-aaaaaaaaaa',
          threadId: 'tie-aaaaaaaaaa',
          createdAt: '2026-10-19T10:30:00.000Z',
        });
        const tieB = sampleComment(slug, {
          id: 'tie-bbbbbbbbbb',
          threadId: 'tie-bbbbbbbbbb',
          createdAt: '2026-10-19T10:30:00.000Z',
        });
        const reply: ReviewCommentInput = {
          id: `r${unique()}`.padEnd(12, '0'),
          threadId: early.id,
          slug,
          body: 'Agreed.',
          author: { name: 'Sam Example', clientId: 'client-second' },
          createdAt: '2026-10-19T09:30:00.000Z',
        };
        for (const c of [late, tieB, reply, early, tieA]) await adapter.put(c);
        await adapter.put(sampleComment(`${slug}-other`));
        expect((await adapter.list(slug)).map((c) => c.id)).toEqual([
          early.id,
          reply.id,
          tieA.id,
          tieB.id,
          late.id,
        ]);
        await adapter.remove(`${slug}-other`); // harmless: not an id
      })
    );

    it(
      'filters by since (updatedAt), including edits of older comments',
      withAdapter(async (adapter, slug) => {
        const a = await adapter.put(sampleComment(slug));
        const since = a.updatedAt as string;
        expect(await adapter.list(slug, { since })).toEqual([]);
        const b = await adapter.put(sampleComment(slug, { createdAt: '2026-10-19T11:00:00.000Z' }));
        expect((await adapter.list(slug, { since })).map((c) => c.id)).toEqual([b.id]);
        await adapter.put({
          ...sampleComment(slug, { id: a.id, threadId: a.id }),
          body: 'Edited later',
        });
        expect((await adapter.list(slug, { since })).map((c) => c.id).sort()).toEqual(
          [a.id, b.id].sort()
        );
      })
    );

    it(
      'rejects comments the core schema rejects, and stores nothing',
      withAdapter(async (adapter, slug) => {
        const bad: unknown[] = [
          sampleComment(slug, { body: '   ' }),
          sampleComment(slug, { slug: 'Not A Slug' }),
          { ...sampleComment(slug), anchor: undefined }, // a thread root needs an anchor
          sampleComment(slug, { id: 'short' }),
          { ...sampleComment(slug), extra: 'field' },
        ];
        for (const input of bad) {
          await expect(adapter.put(input as ReviewCommentInput)).rejects.toThrow();
        }
        expect(await adapter.list(slug)).toEqual([]);
      })
    );

    it(
      'notifies changes through subscribe, or through the polling fallback',
      withAdapter(async (adapter, slug) => {
        let changes = 0;
        const stop = watchReviewComments(adapter, slug, () => changes++, {
          intervalMs: options.pollIntervalMs ?? 25,
        });
        try {
          // Let the poller take its first snapshot.
          await new Promise((resolve) => setTimeout(resolve, (options.pollIntervalMs ?? 25) * 2));
          const stored = await adapter.put(sampleComment(slug));
          await expect.poll(() => changes, { timeout: timeoutMs }).toBeGreaterThan(0);
          const seen = changes;
          await adapter.remove(stored.id);
          await expect.poll(() => changes, { timeout: timeoutMs }).toBeGreaterThan(seen);
        } finally {
          stop();
        }
      })
    );
  });
}
