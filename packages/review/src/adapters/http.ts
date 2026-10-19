import type { ReviewComment, ReviewCommentInput } from '@protoyard/core/review';
import { ReviewCommentSchema } from '@protoyard/core/review';
import {
  acceptStoredComments,
  parseReviewComment,
  type ReviewAdapter,
  type ReviewAdapterInfo,
  sortReviewComments,
} from '../store/index.ts';

const REVIEW_KEY_STORAGE = 'protoyard.review.key.v1';
const DEFAULT_POLL_INTERVAL = 30_000;

export interface HttpReviewAdapterOptions {
  /** API collection URL; relative paths resolve from the host site's root. */
  endpoint?: string;
  /** Stable client id used for server rate limits and local queued writes. */
  clientId: string;
  /** Required local adapter used to retain writes while the API is unavailable. */
  localAdapter: ReviewAdapter;
  /** Fetch-compatible transport, injectable for tests and embedded hosts. */
  fetcher?: typeof fetch;
  /** Session storage for the private review key. */
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Current page URL, used to consume and remove the one-time `?review=` key. */
  location?: Pick<Location, 'href'>;
  /** History replacement used to remove the key without reloading. */
  history?: Pick<History, 'state' | 'replaceState'>;
  /** Base URI including a possible showcase `<base href="p/<slug>/app/">`. */
  baseURI?: string;
  /** Poll cadence while at least one subscriber is open. Defaults to 30 seconds. */
  pollIntervalMs?: number;
  kind?: 'http' | 'cloudflare';
}

export interface PendingHttpWrite {
  id: string;
  slug: string;
  operation: 'put' | 'delete';
}

export interface HttpReviewAdapter extends ReviewAdapter {
  /** Snapshot of writes queued locally but not yet confirmed by the endpoint. */
  pendingWrites(): PendingHttpWrite[];
  /** Number of unconfirmed writes, suitable for toolbar status. */
  pendingCount(): number;
  /** Subscribe to pending queue changes so a host can render offline status. */
  subscribePending(onChange: () => void): () => void;
  /** Retry queued idempotent PUT/DELETE requests. Failures remain queued. */
  retryPending(slug?: string): Promise<void>;
}

export class HttpReviewError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'HttpReviewError';
  }
}

/** Resolve the API URL from the site root, not the embedded prototype path. */
export function resolveReviewApiBase(
  endpoint = '/api/comments',
  baseURI = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI
): string {
  const root = new URL('/', baseURI);
  const resolved = new URL(endpoint, root);
  resolved.search = '';
  resolved.hash = '';
  return resolved.href.replace(/\/+$/, '');
}

interface ApiErrorPayload {
  error?: { code?: unknown; message?: unknown };
}

interface QueuedPut {
  operation: 'put';
  comment: ReviewComment;
}

interface QueuedDelete {
  operation: 'delete';
  id: string;
  slug: string;
}

type QueuedWrite = QueuedPut | QueuedDelete;

function browserStorage(options: HttpReviewAdapterOptions) {
  const browser = typeof window === 'undefined' ? undefined : window;
  let storage = options.sessionStorage;
  if (!storage && browser) {
    try {
      storage = browser.sessionStorage;
    } catch {
      // Private browsing policies can disable storage access entirely.
    }
  }
  return {
    storage,
    location: options.location ?? browser?.location,
    history: options.history ?? browser?.history,
    baseURI: options.baseURI ?? browser?.document.baseURI,
    eventTarget: browser,
  };
}

function readReviewKey(options: HttpReviewAdapterOptions): string | undefined {
  const browser = browserStorage(options);
  if (!browser.location) return undefined;
  try {
    const url = new URL(browser.location.href);
    if (url.searchParams.has('review')) {
      const key = url.searchParams.get('review') ?? '';
      try {
        if (key) browser.storage?.setItem(REVIEW_KEY_STORAGE, key);
        else browser.storage?.removeItem(REVIEW_KEY_STORAGE);
      } catch {
        // Strip the one-time URL value even when storage is unavailable.
      }
      url.searchParams.delete('review');
      const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
      browser.history?.replaceState(browser.history.state, '', cleanUrl);
      return key || undefined;
    }
    try {
      return browser.storage?.getItem(REVIEW_KEY_STORAGE) ?? undefined;
    } catch {
      return undefined;
    }
  } catch {
    // A restricted storage context must not make local review unavailable.
    return undefined;
  }
}

function isTransient(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof HttpReviewError && (error.status === 429 || error.status >= 500))
  );
}

function payloadMessage(value: unknown): { code?: string; message?: string } {
  if (typeof value !== 'object' || value === null || !('error' in value)) return {};
  const error = (value as ApiErrorPayload).error;
  if (typeof error !== 'object' || error === null) return {};
  return {
    ...(typeof error.code === 'string' ? { code: error.code } : {}),
    ...(typeof error.message === 'string' ? { message: error.message } : {}),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpReviewError('The comments endpoint returned invalid JSON.', 502, 'invalid_json');
  }
}

function commentSignature(comments: readonly ReviewComment[]): string {
  return comments
    .map((comment) => `${comment.id}@${comment.updatedAt ?? comment.createdAt}`)
    .join('|');
}

/** HTTP adapter for the review server, with a local queue for transient failures. */
export function createHttpReviewAdapter(options: HttpReviewAdapterOptions): HttpReviewAdapter {
  if (!options.clientId.trim() || options.clientId.length > 128) {
    throw new Error('A clientId between 1 and 128 characters is required.');
  }
  const browser = browserStorage(options);
  const base = resolveReviewApiBase(options.endpoint, browser.baseURI);
  const key = readReviewKey(options);
  const send = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const intervalMs = Math.max(1_000, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
  const pending = new Map<string, QueuedWrite>();
  const knownSlugs = new Set<string>();
  const slugsById = new Map<string, string>();
  const writes = new Map<string, Promise<unknown>>();
  const pendingListeners = new Set<() => void>();
  const info: ReviewAdapterInfo = {
    kind: options.kind ?? 'http',
    shared: true,
    live: true,
  };

  function notifyPending(): void {
    for (const listener of pendingListeners) {
      try {
        listener();
      } catch {
        // A host status renderer must not break queue persistence or retries.
      }
    }
  }

  function enqueue(id: string, write: QueuedWrite): void {
    pending.set(id, write);
    notifyPending();
  }

  function clearPending(id: string): void {
    if (!pending.delete(id)) return;
    notifyPending();
  }

  function urlFor(slug: string, id?: string, since?: string): URL {
    const url = new URL(
      `${encodeURIComponent(slug)}${id ? `/${encodeURIComponent(id)}` : ''}`,
      `${base}/`
    );
    if (since) url.searchParams.set('since', since);
    return url;
  }

  async function request(url: URL, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('x-review-client-id', options.clientId);
    if (key) headers.set('x-review-key', key);
    const response = await send(url, { ...init, headers });
    const body = parseJson(await response.text());
    if (!response.ok) {
      const error = payloadMessage(body);
      throw new HttpReviewError(
        error.message ?? `The comments endpoint returned ${response.status}.`,
        response.status,
        error.code
      );
    }
    return body;
  }

  async function sendPut(comment: ReviewComment): Promise<ReviewComment> {
    const body = await request(urlFor(comment.slug, comment.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comment),
    });
    if (typeof body !== 'object' || body === null || !('comment' in body)) {
      throw new HttpReviewError(
        'The comments endpoint omitted the saved comment.',
        502,
        'invalid_response'
      );
    }
    try {
      return ReviewCommentSchema.parse(body.comment);
    } catch {
      throw new HttpReviewError(
        'The comments endpoint returned an invalid comment.',
        502,
        'invalid_response'
      );
    }
  }

  async function sendDelete(slug: string, id: string): Promise<void> {
    await request(urlFor(slug, id), { method: 'DELETE' });
  }

  function serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = writes.get(id) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    writes.set(
      id,
      current.catch(() => undefined)
    );
    return current;
  }

  async function flush(write: QueuedWrite): Promise<void> {
    await serialize(write.operation === 'put' ? write.comment.id : write.id, async () => {
      const latest = pending.get(write.operation === 'put' ? write.comment.id : write.id);
      if (!latest) return;
      try {
        const queuedBefore = latest;
        if (latest.operation === 'put') await sendPut(latest.comment);
        else await sendDelete(latest.slug, latest.id);
        clearPending(latest.operation === 'put' ? latest.comment.id : latest.id);
        if (queuedBefore.operation === 'delete') {
          await options.localAdapter.remove(queuedBefore.id).catch(() => undefined);
        }
      } catch {
        // Retain the durable local copy and queue until a later retry.
      }
    });
  }

  const adapter: HttpReviewAdapter = {
    info: () => ({ ...info }),
    pendingWrites() {
      return [...pending].map(([id, write]) => ({
        id,
        slug: write.operation === 'put' ? write.comment.slug : write.slug,
        operation: write.operation,
      }));
    },
    pendingCount: () => pending.size,
    subscribePending(onChange) {
      pendingListeners.add(onChange);
      return () => pendingListeners.delete(onChange);
    },
    async retryPending(slug) {
      const queued = [...pending.values()].filter((write) => {
        const queuedSlug = write.operation === 'put' ? write.comment.slug : write.slug;
        return !slug || queuedSlug === slug;
      });
      for (const write of queued) await flush(write);
    },
    async list(slug, { since } = {}) {
      knownSlugs.add(slug);
      try {
        const url = urlFor(slug, undefined, since);
        const body = await request(url);
        if (typeof body !== 'object' || body === null || !('comments' in body)) {
          throw new HttpReviewError(
            'The comments endpoint omitted the comments list.',
            502,
            'invalid_response'
          );
        }
        const remote = acceptStoredComments(
          Array.isArray(body.comments) ? body.comments : []
        ).filter((comment) => comment.slug === slug);
        const merged = new Map(remote.map((comment) => [comment.id, comment]));
        for (const [id, write] of pending) {
          if (write.operation === 'delete' && write.slug === slug) merged.delete(id);
          if (write.operation === 'put' && write.comment.slug === slug)
            merged.set(id, write.comment);
        }
        const result = sortReviewComments([...merged.values()]);
        for (const comment of result) slugsById.set(comment.id, slug);
        return result;
      } catch (error) {
        if (!isTransient(error)) throw error;
        const local = await options.localAdapter.list(slug, { ...(since ? { since } : {}) });
        const merged = new Map(local.map((comment) => [comment.id, comment]));
        for (const [id, write] of pending) {
          if (write.operation === 'delete' && write.slug === slug) merged.delete(id);
          if (write.operation === 'put' && write.comment.slug === slug)
            merged.set(id, write.comment);
        }
        return sortReviewComments([...merged.values()]);
      }
    },
    async put(input: ReviewCommentInput) {
      const comment = parseReviewComment(input);
      knownSlugs.add(comment.slug);
      slugsById.set(comment.id, comment.slug);
      return serialize(comment.id, async () => {
        try {
          const saved = await sendPut(comment);
          clearPending(comment.id);
          return saved;
        } catch (error) {
          if (!isTransient(error)) throw error;
          const local = await options.localAdapter.put(comment);
          enqueue(comment.id, { operation: 'put', comment: local });
          return local;
        }
      });
    },
    async remove(id) {
      const slug = slugsById.get(id);
      if (!slug) {
        for (const candidate of knownSlugs) {
          if ((await options.localAdapter.list(candidate)).some((comment) => comment.id === id)) {
            slugsById.set(id, candidate);
            break;
          }
        }
      }
      const resolvedSlug = slugsById.get(id);
      if (!resolvedSlug) return;
      return serialize(id, async () => {
        const queuedBefore = pending.get(id);
        try {
          await sendDelete(resolvedSlug, id);
          clearPending(id);
          if (queuedBefore?.operation === 'put') {
            await options.localAdapter.remove(id).catch(() => undefined);
          }
        } catch (error) {
          if (!isTransient(error)) throw error;
          enqueue(id, { operation: 'delete', id, slug: resolvedSlug });
        }
      });
    },
    subscribe(slug, onChange) {
      let stopped = false;
      let signature: string | undefined;
      let inFlight: Promise<void> | undefined;
      const poll = (): Promise<void> => {
        if (stopped) return Promise.resolve();
        if (inFlight) return inFlight;
        inFlight = (async () => {
          await adapter.retryPending(slug);
          try {
            const comments = await adapter.list(slug);
            const next = commentSignature(comments);
            if (signature !== next) {
              signature = next;
              onChange();
            }
          } catch {
            // The panel remains usable from its current data while offline.
          }
        })().finally(() => {
          inFlight = undefined;
        });
        return inFlight;
      };
      const onFocus = () => void poll();
      browser.eventTarget?.addEventListener('focus', onFocus);
      const timer = setInterval(() => void poll(), intervalMs);
      void poll();
      return () => {
        stopped = true;
        browser.eventTarget?.removeEventListener('focus', onFocus);
        clearInterval(timer);
      };
    },
  };
  return adapter;
}
