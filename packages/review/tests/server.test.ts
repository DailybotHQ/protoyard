// @vitest-environment node
import type { ReviewComment } from '@protoyard/core/review';
import { ReviewCommentSchema } from '@protoyard/core/review';
import { describe, expect, it } from 'vitest';
import {
  createD1CommentsStore,
  createKvCommentsStore,
  createMemoryCommentsStore,
  handleCommentsRequest,
  type ReviewD1Database,
  type ReviewD1PreparedStatement,
  type ReviewKvNamespace,
  type ReviewSummary,
} from '../src/server/index.ts';
import { sampleComment } from './conformance.ts';

const ORIGIN = 'https://review.example';
const now = () => Date.parse('2026-10-19T12:00:00.000Z');

function request(
  path: string,
  method = 'GET',
  body?: string,
  headers: Record<string, string> = {}
) {
  const origin = headers.Origin ?? (method === 'PUT' || method === 'DELETE' ? ORIGIN : undefined);
  const { Origin: _origin, ...additionalHeaders } = headers;
  const result = new Request(`${ORIGIN}${path}`, {
    method,
    ...(body === undefined ? {} : { body }),
    headers: {
      'x-review-client-id': 'client-reviewer-1',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...additionalHeaders,
    },
  });
  if (origin) {
    const requestHeaders = new Headers(result.headers);
    requestHeaders.set('Origin', origin);
    Object.defineProperty(result, 'headers', { value: requestHeaders });
  }
  return result;
}

interface JsonPayload {
  comment?: ReviewComment;
  comments?: ReviewComment[];
  summary?: ReviewSummary;
  deleted?: string;
  error?: { code?: string; issues?: unknown };
}

async function payload(response: Response): Promise<JsonPayload> {
  return (await response.json()) as JsonPayload;
}

describe('comments Request/Response handler', () => {
  it('supports PUT, GET, since, summary and DELETE with JSON-only safe headers', async () => {
    const store = createMemoryCommentsStore();
    const input = sampleComment('demo-app', {
      id: 'comment-00001',
      threadId: 'comment-00001',
      body: '<script>alert("x")</script>',
      createdAt: '2000-01-01T00:00:00.000Z',
    });
    const putRequest = request(
      '/api/comments/demo-app/comment-00001',
      'PUT',
      JSON.stringify(input)
    );
    expect(putRequest.headers.get('origin')).toBe(ORIGIN);
    expect(new URL(putRequest.url).origin).toBe(ORIGIN);
    const put = await handleCommentsRequest(putRequest, { now }, store);
    expect(put.status).toBe(200);
    expect(put.headers.get('content-type')).toContain('application/json');
    expect(put.headers.get('x-content-type-options')).toBe('nosniff');
    expect(put.headers.get('referrer-policy')).toBe('no-referrer');
    const saved = (await payload(put)).comment as ReviewComment;
    expect(saved.createdAt).toBe('2026-10-19T12:00:00.000Z');
    expect(saved.updatedAt).toBe('2026-10-19T12:00:00.000Z');
    expect(saved.body).toBe('<script>alert("x")</script>');

    const edited = await handleCommentsRequest(
      request(
        '/api/comments/demo-app/comment-00001',
        'PUT',
        JSON.stringify({ ...input, body: 'Updated by a reviewer.' })
      ),
      { now: () => now() + 1000 },
      store
    );
    const updated = (await payload(edited)).comment as ReviewComment;
    expect(updated.createdAt).toBe(saved.createdAt);
    expect(updated.updatedAt).toBe('2026-10-19T12:00:01.000Z');
    expect(updated.body).toBe('Updated by a reviewer.');

    const list = await handleCommentsRequest(request('/api/comments/demo-app'), {}, store);
    expect((await payload(list)).comments).toEqual([updated]);
    const filtered = await handleCommentsRequest(
      request('/api/comments/demo-app?since=2026-10-19T12%3A00%3A01.000Z'),
      {},
      store
    );
    expect((await payload(filtered)).comments).toEqual([]);
    const summary = await handleCommentsRequest(
      request('/api/comments/demo-app/summary'),
      {},
      store
    );
    expect((await payload(summary)).summary).toMatchObject({
      total: 1,
      threads: 1,
      open: 1,
      resolved: 0,
    });

    const deletion = await handleCommentsRequest(
      request('/api/comments/demo-app/comment-00001', 'DELETE'),
      { now },
      store
    );
    expect(deletion.status).toBe(200);
    expect((await payload(deletion)).deleted).toBe('comment-00001');
    expect(
      (await payload(await handleCommentsRequest(request('/api/comments/demo-app'), {}, store)))
        .comments
    ).toEqual([]);
  });

  it('returns 422 for invalid schemas and path mismatches, and 400 for invalid query timestamps', async () => {
    const store = createMemoryCommentsStore();
    const malformedJson = await handleCommentsRequest(
      request('/api/comments/demo-app/comment-00001', 'PUT', '{'),
      { now },
      store
    );
    expect(malformedJson.status).toBe(400);

    const invalid = await handleCommentsRequest(
      request(
        '/api/comments/demo-app/comment-00001',
        'PUT',
        JSON.stringify({ ...sampleComment('demo-app'), body: 'x'.repeat(2001) })
      ),
      { now },
      store
    );
    expect(invalid.status).toBe(422);
    expect((await payload(invalid)).error?.issues).toBeDefined();

    const mismatch = await handleCommentsRequest(
      request(
        '/api/comments/demo-app/comment-00002',
        'PUT',
        JSON.stringify(
          sampleComment('demo-app', { id: 'comment-00001', threadId: 'comment-00001' })
        )
      ),
      { now },
      store
    );
    expect(mismatch.status).toBe(422);
    expect((await payload(mismatch)).error?.code).toBe('route_mismatch');

    const since = await handleCommentsRequest(
      request('/api/comments/demo-app?since=tomorrow'),
      {},
      store
    );
    expect(since.status).toBe(400);
    expect((await payload(since)).error?.code).toBe('invalid_since');
    expect(await store.list('demo-app')).toEqual([]);
  });

  it('rejects malformed, wrong-key and cross-origin writes with JSON responses', async () => {
    const store = createMemoryCommentsStore();
    const input = JSON.stringify(
      sampleComment('demo-app', { id: 'comment-00001', threadId: 'comment-00001' })
    );
    const env = { REVIEW_KEY: 'a long example review key', now };
    const missing = await handleCommentsRequest(
      request('/api/comments/demo-app/comment-00001', 'PUT', input),
      env,
      store
    );
    expect(missing.status).toBe(401);
    const wrong = await handleCommentsRequest(
      request('/api/comments/demo-app/comment-00001', 'PUT', input, { 'x-review-key': 'wrong' }),
      env,
      store
    );
    expect(wrong.status).toBe(401);
    const right = await handleCommentsRequest(
      request('/api/comments/demo-app/comment-00001', 'PUT', input, {
        'x-review-key': env.REVIEW_KEY,
      }),
      env,
      store
    );
    expect(right.status).toBe(200);

    const crossOrigin = await handleCommentsRequest(
      request('/api/comments/demo-app/comment-00001', 'DELETE', undefined, {
        Origin: 'https://evil.example',
      }),
      {},
      store
    );
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.headers.get('x-content-type-options')).toBe('nosniff');
    const missingOrigin = await handleCommentsRequest(
      new Request(`${ORIGIN}/api/comments/demo-app/comment-00001`, { method: 'DELETE' }),
      {},
      store
    );
    expect(missingOrigin.status).toBe(403);
  });

  it('rejects oversized requests and applies fixed-window client/IP limits', async () => {
    const store = createMemoryCommentsStore();
    const oversized = await handleCommentsRequest(
      request(
        '/api/comments/demo-app/comment-00001',
        'PUT',
        JSON.stringify({ body: 'x'.repeat(17_000) })
      ),
      { now },
      store
    );
    expect(oversized.status).toBe(413);

    const limitedStore = createMemoryCommentsStore();
    const limitedEnv = { now, perClientRateLimit: 1, perIpRateLimit: 5, rateWindowMs: 10_000 };
    expect(
      (await handleCommentsRequest(request('/api/comments/demo-app'), limitedEnv, limitedStore))
        .status
    ).toBe(200);
    const limited = await handleCommentsRequest(
      request('/api/comments/demo-app'),
      limitedEnv,
      limitedStore
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('10');

    const ipLimitedStore = createMemoryCommentsStore();
    const ipLimitedEnv = { now, perClientRateLimit: 5, perIpRateLimit: 1, rateWindowMs: 10_000 };
    expect(
      (
        await handleCommentsRequest(
          request('/api/comments/demo-app', 'GET', undefined, {
            'x-review-client-id': 'client-reviewer-a',
            'cf-connecting-ip': '192.0.2.10',
          }),
          ipLimitedEnv,
          ipLimitedStore
        )
      ).status
    ).toBe(200);
    const ipLimited = await handleCommentsRequest(
      request('/api/comments/demo-app', 'GET', undefined, {
        'x-review-client-id': 'client-reviewer-b',
        'cf-connecting-ip': '192.0.2.10',
      }),
      ipLimitedEnv,
      ipLimitedStore
    );
    expect(ipLimited.status).toBe(429);
  });

  it('validates slugs and rejects unsupported methods', async () => {
    const store = createMemoryCommentsStore();
    expect((await handleCommentsRequest(request('/api/comments/api'), {}, store)).status).toBe(404);
    const method = await handleCommentsRequest(
      request('/api/comments/demo-app', 'POST'),
      {},
      store
    );
    expect(method.status).toBe(405);
    expect(method.headers.get('content-type')).toContain('application/json');
  });
});

describe('comment stores', () => {
  it('supports CRUD and fixed-window limits through KV', async () => {
    const values = new Map<string, string>();
    const kv: ReviewKvNamespace = {
      async get(key) {
        return values.get(key) ?? null;
      },
      async put(key, value) {
        values.set(key, value);
      },
      async delete(key) {
        values.delete(key);
      },
      async list({ prefix = '', cursor } = {}) {
        const keys = [...values.keys()].filter((key) => key.startsWith(prefix)).sort();
        const start = cursor ? Number(cursor) : 0;
        const page = keys.slice(start, start + 1000);
        const next = start + page.length;
        return {
          keys: page.map((name) => ({ name })),
          list_complete: next >= keys.length,
          cursor: String(next),
        };
      },
    };
    const store = createKvCommentsStore(kv);
    const comment = parseComment(
      sampleComment('demo-app', { id: 'comment-00001', threadId: 'comment-00001' })
    );
    await store.put(comment);
    expect(await store.get('demo-app', comment.id)).toEqual(comment);
    expect(await store.list('demo-app')).toEqual([comment]);
    expect((await store.summary('demo-app')).threads).toBe(1);
    expect(await store.consumeRateLimit('ip:test', 1000, 1, 10_000)).toEqual({ allowed: true });
    expect(await store.consumeRateLimit('ip:test', 1000, 1, 10_000)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 10,
    });
    await store.remove('demo-app', comment.id);
    expect(await store.get('demo-app', comment.id)).toBeUndefined();
  });

  it('supports CRUD and atomic window updates through D1', async () => {
    const comments = new Map<string, ReviewComment>();
    const rates = new Map<string, { start: number; count: number }>();
    const d1: ReviewD1Database = {
      prepare(query) {
        let values: unknown[] = [];
        const statement: ReviewD1PreparedStatement = {
          bind(...args) {
            values = args;
            return statement;
          },
          async all<T>() {
            if (!query.startsWith('SELECT comment_json FROM comments WHERE slug = ?'))
              return { results: [] as T[] };
            const [slug, since] = values as [string, string | null, string | null];
            const results = [...comments.values()]
              .filter(
                (comment) =>
                  comment.slug === slug &&
                  (!since || Date.parse(comment.updatedAt ?? comment.createdAt) > Date.parse(since))
              )
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
              .map((comment) => ({ comment_json: JSON.stringify(comment) }));
            return { results: results as T[] };
          },
          async first<T>() {
            if (query.startsWith('SELECT comment_json FROM comments WHERE slug = ? AND id = ?')) {
              const [slug, id] = values as [string, string];
              const comment = comments.get(`${slug}/${id}`);
              return (comment ? { comment_json: JSON.stringify(comment) } : null) as T | null;
            }
            if (query.startsWith('INSERT INTO rate_limits')) {
              const [key, nowValue, windowMsA, nowA] = values as [
                string,
                number,
                number,
                number,
                number,
                number,
                number,
              ];
              const current = rates.get(key);
              const start = current && current.start + windowMsA > nowA ? current.start : nowValue;
              const count = current && start === current.start ? current.count + 1 : 1;
              rates.set(key, { start, count });
              return { window_start_ms: start, count } as T;
            }
            return null;
          },
          async run() {
            if (query.startsWith('INSERT INTO comments')) {
              const comment = JSON.parse(String(values[5])) as ReviewComment;
              comments.set(`${comment.slug}/${comment.id}`, comment);
            } else if (query.startsWith('DELETE FROM comments')) {
              comments.delete(`${String(values[0])}/${String(values[1])}`);
            }
            return { success: true };
          },
        };
        return statement;
      },
    };
    const store = createD1CommentsStore(d1);
    const comment = parseComment(
      sampleComment('demo-app', { id: 'comment-00001', threadId: 'comment-00001' })
    );
    await store.put(comment);
    expect(await store.get('demo-app', comment.id)).toEqual(comment);
    expect(await store.list('demo-app')).toEqual([comment]);
    expect((await store.summary('demo-app')).threads).toBe(1);
    expect(await store.consumeRateLimit('client:test', 1000, 1, 10_000)).toEqual({ allowed: true });
    expect(await store.consumeRateLimit('client:test', 1000, 1, 10_000)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 10,
    });
    await store.remove('demo-app', comment.id);
    expect(await store.get('demo-app', comment.id)).toBeUndefined();
  });
});

function parseComment(value: unknown) {
  // The handler applies this same core schema to every persisted write.
  return ReviewCommentSchema.parse(value);
}
