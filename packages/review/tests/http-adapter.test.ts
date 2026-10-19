// @vitest-environment happy-dom

import { ReviewCommentSchema } from '@protoyard/core/review';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpReviewAdapter, resolveReviewApiBase } from '../src/adapters/http.ts';
import { createLocalReviewAdapter, type LocalReviewAdapter } from '../src/adapters/local/index.ts';
import { createMemoryCommentsStore, handleCommentsRequest } from '../src/server/index.ts';
import { sampleComment } from './conformance.ts';

const ORIGIN = 'https://review.example';
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

function makeAdapter(
  store = createMemoryCommentsStore(),
  options: Parameters<typeof fetchShim>[1] = {}
): {
  adapter: ReturnType<typeof createHttpReviewAdapter>;
  local: LocalReviewAdapter;
  store: ReturnType<typeof createMemoryCommentsStore>;
} {
  const local = localAdapter();
  const adapter = createHttpReviewAdapter({
    endpoint: '/api/comments',
    clientId: 'client-http-test',
    localAdapter: local,
    fetcher: fetchShim(store, options),
    baseURI: `${ORIGIN}/p/demo-app/app/`,
  });
  return { adapter, local, store };
}

describe('HTTP ReviewAdapter', () => {
  it('round-trips through the handler and resolves the endpoint from the site root', async () => {
    document.head.innerHTML = `<base href="${ORIGIN}/p/demo-app/app/">`;
    window.history.replaceState(null, '', '/p/demo-app/app/?scenario=active#/home');
    const requests: Array<{ url: string; key: string | null }> = [];
    const store = createMemoryCommentsStore();
    const adapter = createHttpReviewAdapter({
      endpoint: '/api/comments',
      clientId: 'client-http-test',
      localAdapter: localAdapter(),
      fetcher: fetchShim(store, { requests }),
    });
    const input = sampleComment('demo-app', {
      id: 'http-comment-0001',
      threadId: 'http-comment-0001',
    });

    expect(resolveReviewApiBase('/api/comments', document.baseURI)).toBe(`${ORIGIN}/api/comments`);
    await expect(adapter.put(input)).resolves.toMatchObject({ id: input.id, body: input.body });
    expect(await adapter.list('demo-app')).toHaveLength(1);
    await adapter.remove(input.id);
    expect(await adapter.list('demo-app')).toEqual([]);
    expect(
      requests.every((request) => new URL(request.url).pathname.startsWith('/api/comments/'))
    ).toBe(true);
  });

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

  it('strips a one-time review key even when sessionStorage is unavailable', async () => {
    window.history.replaceState(null, '', '/p/demo-app/app/?review=temporary-key&scenario=busy');
    const requests: Array<{ url: string; key: string | null }> = [];
    const adapter = createHttpReviewAdapter({
      endpoint: '/api/comments',
      clientId: 'client-http-test',
      localAdapter: localAdapter(),
      fetcher: fetchShim(createMemoryCommentsStore(), { requests }),
      sessionStorage: {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
        removeItem: () => {
          throw new Error('storage disabled');
        },
      },
    });

    expect(window.location.search).toBe('?scenario=busy');
    await adapter.list('demo-app');
    expect(requests[0]?.key).toBe('temporary-key');
  });

  it('keeps transiently failed writes in the local adapter and retries idempotently', async () => {
    let offline = true;
    const { adapter, local, store } = makeAdapter(undefined, { fail: () => offline });
    const input = sampleComment('demo-app', {
      id: 'http-queued-0001',
      threadId: 'http-queued-0001',
    });

    const queued = await adapter.put(input);
    expect(adapter.pendingWrites()).toEqual([{ id: input.id, slug: 'demo-app', operation: 'put' }]);
    expect(await local.list('demo-app')).toEqual([queued]);
    expect(await store.list('demo-app')).toEqual([]);

    offline = false;
    await adapter.retryPending('demo-app');
    await adapter.retryPending('demo-app');
    expect(adapter.pendingCount()).toBe(0);
    expect(await store.list('demo-app')).toHaveLength(1);
    await adapter.put({ ...input, body: 'Updated once the connection returned.' });
    expect(await store.list('demo-app')).toHaveLength(1);
    expect((await store.list('demo-app'))[0]?.body).toBe('Updated once the connection returned.');
  });

  it('reconciles a local IndexedDB write after reload without an in-memory queue', async () => {
    let offline = true;
    const indexedDB = new IDBFactory();
    const namespace = `http-review-reload-${++namespaceSequence}`;
    const store = createMemoryCommentsStore();
    const localBeforeReload = createLocalReviewAdapter({
      namespace,
      clientId: 'client-http-test',
      indexedDB,
      IDBKeyRange,
    });
    localAdapters.add(localBeforeReload);
    const beforeReload = createHttpReviewAdapter({
      clientId: 'client-http-test',
      localAdapter: localBeforeReload,
      fetcher: fetchShim(store, { fail: () => offline }),
      baseURI: `${ORIGIN}/p/demo-app/app/`,
    });
    const input = sampleComment('demo-app', {
      id: 'http-reload-0001',
      threadId: 'http-reload-0001',
    });

    const localComment = await beforeReload.put(input);
    expect(beforeReload.pendingCount()).toBe(1);
    beforeReload.subscribePending(() => undefined)();
    localBeforeReload.close();

    // A new adapter instance models a page reload: its in-memory queue starts empty.
    const localAfterReload = createLocalReviewAdapter({
      namespace,
      clientId: 'client-http-test',
      indexedDB,
      IDBKeyRange,
    });
    localAdapters.add(localAfterReload);
    const afterReload = createHttpReviewAdapter({
      clientId: 'client-http-test',
      localAdapter: localAfterReload,
      fetcher: fetchShim(store, { fail: () => offline }),
      baseURI: `${ORIGIN}/p/demo-app/app/`,
    });

    await expect(afterReload.list('demo-app')).resolves.toMatchObject([
      { id: localComment.id, body: localComment.body },
    ]);
    expect(afterReload.pendingCount()).toBe(1);
    expect(afterReload.pendingWrites()).toEqual([
      { id: localComment.id, slug: 'demo-app', operation: 'put' },
    ]);
    offline = false;
    await afterReload.retryPending('demo-app');
    expect(await store.list('demo-app')).toMatchObject([{ id: localComment.id, body: input.body }]);
    expect(afterReload.pendingCount()).toBe(0);
  });

  it('uploads a newer local edit and keeps a newer server edit during reconciliation', async () => {
    const store = createMemoryCommentsStore();
    const input = sampleComment('demo-app', {
      id: 'http-reconcile-0001',
      threadId: 'http-reconcile-0001',
    });
    await store.put(
      ReviewCommentSchema.parse({
        ...input,
        body: 'Older server version.',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      })
    );
    const local = createLocalReviewAdapter({
      namespace: `http-review-reconcile-${++namespaceSequence}`,
      clientId: 'client-http-test',
      now: () => Date.parse('2025-01-03T00:00:00.000Z'),
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
    localAdapters.add(local);
    await local.put({ ...input, body: 'Newer local version.' });
    const adapter = createHttpReviewAdapter({
      clientId: 'client-http-test',
      localAdapter: local,
      fetcher: fetchShim(store),
      baseURI: `${ORIGIN}/p/demo-app/app/`,
    });

    await expect(adapter.list('demo-app')).resolves.toMatchObject([
      { id: input.id, body: 'Newer local version.' },
    ]);
    expect(await store.list('demo-app')).toMatchObject([{ body: 'Newer local version.' }]);

    await store.put(
      ReviewCommentSchema.parse({
        ...input,
        body: 'Newest server version.',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-04T00:00:00.000Z',
      })
    );
    await expect(adapter.list('demo-app')).resolves.toMatchObject([
      { id: input.id, body: 'Newest server version.' },
    ]);
    expect(await store.list('demo-app')).toMatchObject([{ body: 'Newest server version.' }]);
  });

  it('polls on focus and every 30 seconds only while a subscriber is open', async () => {
    vi.useFakeTimers();
    const requests: Array<{ url: string; key: string | null }> = [];
    const store = createMemoryCommentsStore();
    const adapter = createHttpReviewAdapter({
      endpoint: '/api/comments',
      clientId: 'client-http-test',
      localAdapter: localAdapter(),
      fetcher: fetchShim(store, { requests }),
    });
    const changed = vi.fn();
    const unsubscribe = adapter.subscribe?.('demo-app', changed);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
      expect(changed).toHaveBeenCalled();
    });
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    unsubscribe?.();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests).toHaveLength(3);
    expect(changed).toHaveBeenCalled();
  });
});
