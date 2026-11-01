import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtifactReviewAdapterFromCapabilities } from '../src/adapters/artifact.ts';
import { createHttpReviewAdapter } from '../src/adapters/http.ts';
import { createLocalReviewAdapter, type LocalReviewAdapter } from '../src/adapters/local/index.ts';
import { createMemoryCommentsStore, handleCommentsRequest } from '../src/server/index.ts';
import {
  acceptStoredComments,
  changedSince,
  createMemoryReviewAdapter,
  sortReviewComments,
} from '../src/store/index.ts';
import { runAdapterConformance, sampleComment } from './conformance.ts';
import { createFakeClaude } from './fixtures/fake-claude.ts';

// The reference adapter runs the shared conformance suite (the adapter contract).
runAdapterConformance('memory (live)', () => createMemoryReviewAdapter());

describe('store helpers', () => {
  it('keeps only valid stored rows, sorts and filters by since', () => {
    const a = {
      ...sampleComment('demo-app', { id: 'aaaaaaaaaaaa', threadId: 'aaaaaaaaaaaa' }),
      updatedAt: '2026-10-19T10:00:00.000Z',
    };
    const b = {
      ...sampleComment('demo-app', {
        id: 'bbbbbbbbbbbb',
        threadId: 'bbbbbbbbbbbb',
        createdAt: '2026-10-19T08:00:00.000Z',
      }),
    };
    const valid = acceptStoredComments([a, { id: 'junk' }, null, '<script>', b]);
    expect(valid.map((c) => c.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(sortReviewComments(valid).map((c) => c.id)).toEqual(['bbbbbbbbbbbb', 'aaaaaaaaaaaa']);
    expect(changedSince(valid[0] as never, '2026-10-19T09:59:59.000Z')).toBe(true);
    expect(changedSince(valid[0] as never, '2026-10-19T10:00:00.000Z')).toBe(false);
    expect(changedSince(valid[1] as never, undefined)).toBe(true); // no stamp: createdAt
  });
});

// --- merged from local-adapter.test.ts ---

describe('local-adapter', () => {
  let sequence = 0;
  const namespace = () => `review-local-${++sequence}`;
  const clientId = 'client-conformance';

  describe('local review adapter', () => {
    it('rejects malformed, oversized, and foreign-namespace files without partial writes', async () => {
      const ns = namespace();
      const adapter = createLocalReviewAdapter({ namespace: ns, clientId });
      const valid = {
        format: 'protoyard-review-comments',
        version: 1,
        namespace: ns,
        slug: ns,
        comments: [sampleComment(ns)],
      };
      try {
        await expect(adapter.importComments(new Blob(['{']))).rejects.toThrow();
        await expect(
          adapter.importComments(new Blob(['x'.repeat(5 * 1024 * 1024 + 1)]))
        ).rejects.toThrow(/5 MB/);
        await expect(
          adapter.importComments(
            new Blob([
              JSON.stringify({
                ...valid,
                namespace: 'foreign-prototype',
              }),
            ])
          )
        ).rejects.toThrow(/different prototype/);
        await expect(
          adapter.importComments(
            new Blob([
              JSON.stringify({
                ...valid,
                slug: 'foreign-slug',
              }),
            ])
          )
        ).rejects.toThrow(/foreign slug/);
        await expect(
          adapter.importComments(
            new Blob([
              JSON.stringify({
                ...valid,
                comments: [...valid.comments, { id: 'invalid' }],
              }),
            ])
          )
        ).rejects.toThrow();
        expect(await adapter.list(ns)).toEqual([]);
      } finally {
        adapter.close();
      }
    });

    it('prevents editing or deleting comments authored by another client', async () => {
      const ns = namespace();
      const owner = createLocalReviewAdapter({ namespace: ns, clientId: 'owner-client' });
      const other = createLocalReviewAdapter({ namespace: ns, clientId: 'other-client' });
      try {
        const stored = await owner.put(
          sampleComment(ns, {
            author: { name: 'Riley Reviewer', clientId: 'owner-client' },
          })
        );
        await expect(other.put({ ...stored, body: 'An unauthorized edit.' })).rejects.toThrow(
          /Only the comment author/
        );
        await expect(other.remove(stored.id)).rejects.toThrow(/Only the comment author/);
        expect((await owner.list(ns))[0]?.body).toBe(stored.body);
      } finally {
        owner.close();
        other.close();
      }
    });
  });
});

// --- merged from artifact-adapter.test.ts ---

describe('artifact-adapter', () => {
  describe('artifact ReviewAdapter', () => {
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
  });
});

// --- merged from http-adapter.test.ts ---

describe('http-adapter', () => {
  const KEY = 'example-review-key';
  let namespaceSequence = 0;
  const localAdapters = new Set<LocalReviewAdapter>();

  afterEach(() => {
    for (const adapter of localAdapters) adapter.close();
    localAdapters.clear();
    vi.useRealTimers();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    document.querySelector('base')?.remove();
  });

  function localAdapter(clientId = 'client-http-test'): LocalReviewAdapter {
    const adapter = createLocalReviewAdapter({
      namespace: `http-review-${++namespaceSequence}`,
      clientId,
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
    localAdapters.add(adapter);
    return adapter;
  }

  function fetchShim(
    store: ReturnType<typeof createMemoryCommentsStore>,
    options: {
      key?: string;
      fail?: () => boolean;
      requests?: Array<{ url: string; key: string | null }>;
    } = {}
  ): typeof fetch {
    return async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      options.requests?.push({
        url: url.href,
        key: new Headers(init?.headers).get('x-review-key'),
      });
      if (options.fail?.()) throw new TypeError('offline');
      const headers = new Headers(init?.headers);
      if (init?.method === 'PUT' || init?.method === 'DELETE') headers.set('Origin', url.origin);
      const request = new Request(url, { ...init, headers });
      if (init?.method === 'PUT' || init?.method === 'DELETE') {
        request.headers.set('Origin', url.origin);
      }
      return handleCommentsRequest(
        request,
        { ...(options.key ? { REVIEW_KEY: options.key } : {}) },
        store
      );
    };
  }

  describe('HTTP ReviewAdapter', () => {
    it('moves ?review= into sessionStorage and removes it from the URL before requests', async () => {
      window.history.replaceState(
        null,
        '',
        '/p/demo-app/app/?review=example-review-key&scenario=busy#/deals'
      );
      const requests: Array<{ url: string; key: string | null }> = [];
      const store = createMemoryCommentsStore();
      const adapter = createHttpReviewAdapter({
        endpoint: '/api/comments',
        clientId: 'client-http-test',
        localAdapter: localAdapter(),
        fetcher: fetchShim(store, { key: KEY, requests }),
      });

      expect(window.location.href).not.toContain(KEY);
      expect(window.location.search).toBe('?scenario=busy');
      expect(window.location.hash).toBe('#/deals');
      expect(window.sessionStorage.getItem('protoyard.review.key.v1')).toBe(KEY);
      await adapter.list('demo-app');
      expect(requests[0]?.key).toBe(KEY);
      expect(requests[0]?.url).not.toContain(KEY);
    });
  });
});
