import { checkSlug } from '@protoyard/core';
import {
  REVIEW_LIMITS,
  type ReviewComment,
  ReviewCommentSchema,
  ReviewIdSchema,
} from '@protoyard/core/review';
import { sortReviewComments } from '../store/index.ts';

const MAX_REQUEST_BYTES = 16 * 1024;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_CLIENT_LIMIT = 30;
const DEFAULT_IP_LIMIT = 120;

export interface ReviewSummary {
  total: number;
  threads: number;
  open: number;
  resolved: number;
  lastUpdatedAt: string | null;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Store boundary shared by the in-memory, Workers KV and D1 implementations. */
export interface CommentsStore {
  list(slug: string, since?: string): Promise<ReviewComment[]>;
  get(slug: string, id: string): Promise<ReviewComment | undefined>;
  put(comment: ReviewComment): Promise<void>;
  remove(slug: string, id: string): Promise<void>;
  summary(slug: string): Promise<ReviewSummary>;
  consumeRateLimit(
    key: string,
    now: number,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult>;
}

export interface CommentsHandlerEnv {
  /** Optional shared key. This discourages casual writes; it is not authentication. */
  REVIEW_KEY?: string;
  now?: () => number;
  perClientRateLimit?: number;
  perIpRateLimit?: number;
  rateWindowMs?: number;
}

interface KvKey {
  name: string;
}

interface KvListResult {
  keys: KvKey[];
  list_complete: boolean;
  cursor?: string;
}

/** Structural subset of Workers KV; intentionally no Cloudflare type import. */
export interface ReviewKvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<KvListResult>;
}

export interface ReviewD1Result<T = Record<string, unknown>> {
  results?: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
}

export interface ReviewD1PreparedStatement {
  bind(...values: unknown[]): ReviewD1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<ReviewD1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<ReviewD1Result<T>>;
}

/** Structural subset of Workers D1; intentionally no Cloudflare type import. */
export interface ReviewD1Database {
  prepare(query: string): ReviewD1PreparedStatement;
}

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(status: number, value: unknown, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(responseHeaders);
  if (extraHeaders) {
    for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value);
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
  headers?: HeadersInit
) {
  return json(status, { ok: false, error: { code, message, ...extra } }, headers);
}

function parseRoute(
  url: URL
):
  | { kind: 'list'; slug: string }
  | { kind: 'summary'; slug: string }
  | { kind: 'comment'; slug: string; id: string }
  | undefined {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'comments' || parts.length < 3 || parts.length > 4) {
    return undefined;
  }
  let slug: string;
  try {
    slug = decodeURIComponent(parts[2] ?? '');
  } catch {
    return undefined;
  }
  const checkedSlug = checkSlug(slug);
  if (!checkedSlug.ok || checkedSlug.slug !== slug) return undefined;
  if (parts.length === 3) return { kind: 'list', slug };
  let tail: string;
  try {
    tail = decodeURIComponent(parts[3] ?? '');
  } catch {
    return undefined;
  }
  if (tail === 'summary') return { kind: 'summary', slug };
  if (!ReviewIdSchema.safeParse(tail).success) return undefined;
  return { kind: 'comment', slug, id: tail };
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json')
    throw new HttpFault(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  const statedLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(statedLength) && statedLength > MAX_REQUEST_BYTES) {
    throw new HttpFault(413, 'request_too_large', 'Request body exceeds 16 KB.');
  }
  if (!request.body) throw new HttpFault(400, 'invalid_json', 'Request body must contain JSON.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new HttpFault(413, 'request_too_large', 'Request body exceeds 16 KB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpFault(400, 'invalid_json', 'Request body is not valid UTF-8 JSON.');
  }
}

class HttpFault extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

async function keyMatches(expected: string, received: string | null): Promise<boolean> {
  if (received === null) return false;
  const encoder = new TextEncoder();
  const [expectedHash, receivedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
  ]);
  const a = new Uint8Array(expectedHash);
  const b = new Uint8Array(receivedHash);
  let difference = expected.length ^ received.length;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

function sameOriginWrite(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

function clientId(request: Request): string {
  const id = request.headers.get('x-review-client-id')?.trim();
  return id && id.length <= 128 ? id : 'anonymous';
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip')?.trim();
  if (forwarded && forwarded.length <= 128) return forwarded;
  const firstForwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return firstForwarded && firstForwarded.length <= 128 ? firstForwarded : 'unknown';
}

function validSince(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpFault(400, 'invalid_since', 'since must be a valid ISO timestamp.');
  }
  return value;
}

function zodIssues(error: {
  issues: Array<{ path: PropertyKey[]; code: string; message: string }>;
}) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String),
    code: issue.code,
    message: issue.message,
  }));
}

/**
 * Handles the shared comments API using only Request/Response and Web Crypto.
 * Configure `REVIEW_KEY` to discourage casual writes; names and client ids are
 * self-declared and neither mechanism authenticates a reviewer.
 */
export async function handleCommentsRequest(
  request: Request,
  env: CommentsHandlerEnv,
  store: CommentsStore
): Promise<Response> {
  const url = new URL(request.url);
  const route = parseRoute(url);
  if (!route) return apiError(404, 'not_found', 'Comments route not found.');

  const method = request.method.toUpperCase();
  const write = method === 'PUT' || method === 'DELETE';
  const allowedMethod =
    (route.kind === 'list' && method === 'GET') ||
    (route.kind === 'summary' && method === 'GET') ||
    (route.kind === 'comment' && ['PUT', 'DELETE'].includes(method));
  if (!allowedMethod) {
    return apiError(405, 'method_not_allowed', 'Method is not allowed for this comments route.', {
      allowed: route.kind === 'comment' ? ['PUT', 'DELETE'] : ['GET'],
    });
  }

  if (write && !sameOriginWrite(request, url)) {
    return apiError(403, 'cross_origin_write', 'Writes must come from this origin.');
  }
  if (env.REVIEW_KEY) {
    try {
      if (!(await keyMatches(env.REVIEW_KEY, request.headers.get('x-review-key')))) {
        return apiError(401, 'review_key_required', 'A valid review key is required.');
      }
    } catch {
      return apiError(500, 'internal_error', 'Comments request could not be completed.');
    }
  }

  const now = env.now?.() ?? Date.now();
  const windowMs = Math.max(1000, env.rateWindowMs ?? DEFAULT_WINDOW_MS);
  const limits = [
    [`client:${clientId(request)}`, Math.max(1, env.perClientRateLimit ?? DEFAULT_CLIENT_LIMIT)],
    [`ip:${clientIp(request)}`, Math.max(1, env.perIpRateLimit ?? DEFAULT_IP_LIMIT)],
  ] as const;
  try {
    for (const [key, limit] of limits) {
      const result = await store.consumeRateLimit(key, now, limit, windowMs);
      if (!result.allowed) {
        const retry = Math.max(1, Math.ceil(result.retryAfterSeconds ?? windowMs / 1000));
        return apiError(
          429,
          'rate_limited',
          'Too many comments requests. Try again later.',
          undefined,
          {
            'Retry-After': String(retry),
          }
        );
      }
    }
  } catch {
    return apiError(500, 'internal_error', 'Comments request could not be completed.');
  }

  try {
    if (route.kind === 'list') {
      const since = validSince(url.searchParams.get('since'));
      const comments = sortReviewComments(await store.list(route.slug, since));
      return json(200, { ok: true, comments });
    }
    if (route.kind === 'summary') {
      return json(200, { ok: true, summary: await store.summary(route.slug) });
    }
    if (method === 'DELETE') {
      await store.remove(route.slug, route.id);
      return json(200, { ok: true, deleted: route.id });
    }

    const raw = await readJsonBody(request);
    const parsed = ReviewCommentSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(422, 'validation_failed', 'Comment does not match the review schema.', {
        issues: zodIssues(parsed.error),
      });
    }
    if (parsed.data.slug !== route.slug || parsed.data.id !== route.id) {
      return apiError(422, 'route_mismatch', 'Comment slug and id must match the request path.');
    }
    const existing = await store.get(route.slug, route.id);
    const stampedAt = new Date(now).toISOString();
    const comment = ReviewCommentSchema.parse({
      ...parsed.data,
      createdAt: existing?.createdAt ?? stampedAt,
      updatedAt: stampedAt,
    });
    await store.put(comment);
    return json(200, { ok: true, comment });
  } catch (error) {
    if (error instanceof HttpFault) {
      return apiError(error.status, error.code, error.message, error.extra);
    }
    return apiError(500, 'internal_error', 'Comments request could not be completed.');
  }
}

function summaryOf(comments: readonly ReviewComment[]): ReviewSummary {
  const roots = comments.filter((comment) => comment.id === comment.threadId);
  return {
    total: comments.length,
    threads: roots.length,
    open: roots.filter((comment) => !comment.resolvedAt).length,
    resolved: roots.filter((comment) => Boolean(comment.resolvedAt)).length,
    lastUpdatedAt: comments.reduce<string | null>((last, comment) => {
      const stamp = comment.updatedAt ?? comment.createdAt;
      return last === null || Date.parse(stamp) > Date.parse(last) ? stamp : last;
    }, null),
  };
}

/** A deterministic, process-local store for tests and small single-isolate uses. */
export function createMemoryCommentsStore(): CommentsStore {
  const comments = new Map<string, ReviewComment>();
  const limits = new Map<string, { start: number; count: number }>();
  const key = (slug: string, id: string) => `${slug}/${id}`;
  return {
    async list(slug, since) {
      return sortReviewComments(
        [...comments.values()].filter(
          (comment) =>
            comment.slug === slug &&
            (!since || Date.parse(comment.updatedAt ?? comment.createdAt) > Date.parse(since))
        )
      ).map((comment) => structuredClone(comment));
    },
    async get(slug, id) {
      const value = comments.get(key(slug, id));
      return value ? structuredClone(value) : undefined;
    },
    async put(comment) {
      comments.set(key(comment.slug, comment.id), structuredClone(comment));
    },
    async remove(slug, id) {
      comments.delete(key(slug, id));
    },
    async summary(slug) {
      return summaryOf([...comments.values()].filter((comment) => comment.slug === slug));
    },
    async consumeRateLimit(bucket, now, limit, windowMs) {
      const current = limits.get(bucket);
      const start = current && now < current.start + windowMs ? current.start : now;
      const count = current && start === current.start ? current.count + 1 : 1;
      limits.set(bucket, { start, count });
      for (const [oldKey, value] of limits) {
        if (now >= value.start + windowMs && oldKey !== bucket) limits.delete(oldKey);
      }
      return count <= limit
        ? { allowed: true }
        : {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
          };
    },
  };
}

function parseComment(value: string | null): ReviewComment | undefined {
  if (!value) return undefined;
  try {
    const parsed = ReviewCommentSchema.safeParse(JSON.parse(value) as unknown);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function d1Rows<T>(result: ReviewD1Result<T>): T[] {
  return result.results ?? [];
}

/** D1 is the recommended shared store: SQL upserts and rate buckets are strongly consistent. */
export function createD1CommentsStore(db: ReviewD1Database): CommentsStore {
  return {
    async list(slug, since) {
      const result = await db
        .prepare(
          'SELECT comment_json FROM comments WHERE slug = ? AND (? IS NULL OR updated_at > ?) ORDER BY created_at, id'
        )
        .bind(slug, since ?? null, since ?? null)
        .all<{ comment_json: string }>();
      return sortReviewComments(
        d1Rows(result).flatMap((row) => {
          const comment = parseComment(row.comment_json);
          return comment ? [comment] : [];
        })
      );
    },
    async get(slug, id) {
      const row = await db
        .prepare('SELECT comment_json FROM comments WHERE slug = ? AND id = ?')
        .bind(slug, id)
        .first<{ comment_json: string }>();
      return parseComment(row?.comment_json ?? null);
    },
    async put(comment) {
      await db
        .prepare(
          'INSERT INTO comments (slug, id, thread_id, created_at, updated_at, comment_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(slug, id) DO UPDATE SET thread_id = excluded.thread_id, updated_at = excluded.updated_at, comment_json = excluded.comment_json'
        )
        .bind(
          comment.slug,
          comment.id,
          comment.threadId,
          comment.createdAt,
          comment.updatedAt ?? comment.createdAt,
          JSON.stringify(comment)
        )
        .run();
    },
    async remove(slug, id) {
      await db.prepare('DELETE FROM comments WHERE slug = ? AND id = ?').bind(slug, id).run();
    },
    async summary(slug) {
      const comments = await this.list(slug);
      return summaryOf(comments);
    },
    async consumeRateLimit(bucket, now, limit, windowMs) {
      const row = await db
        .prepare(`INSERT INTO rate_limits (bucket_key, window_start_ms, count) VALUES (?, ?, 1)
          ON CONFLICT(bucket_key) DO UPDATE SET
            window_start_ms = CASE WHEN rate_limits.window_start_ms + ? <= ? THEN ? ELSE rate_limits.window_start_ms END,
            count = CASE WHEN rate_limits.window_start_ms + ? <= ? THEN 1 ELSE rate_limits.count + 1 END
          RETURNING window_start_ms, count`)
        .bind(bucket, now, windowMs, now, now, windowMs, now)
        .first<{ window_start_ms: number; count: number }>();
      if (!row) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
      return row.count <= limit
        ? { allowed: true }
        : {
            allowed: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((row.window_start_ms + windowMs - now) / 1000)
            ),
          };
    },
  };
}

/** KV is convenient for Workers but its upserts, scans and rate windows are eventually consistent. */
export function createKvCommentsStore(kv: ReviewKvNamespace): CommentsStore {
  const prefix = 'protoyard:review:comments:';
  const ratePrefix = 'protoyard:review:rate:';
  return {
    async list(slug, since) {
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await kv.list({ prefix: `${prefix}${slug}:`, ...(cursor ? { cursor } : {}) });
        names.push(...page.keys.map((entry) => entry.name));
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      const rows = await Promise.all(names.map(async (name) => parseComment(await kv.get(name))));
      return sortReviewComments(
        rows.filter((comment): comment is ReviewComment =>
          Boolean(
            comment &&
              comment.slug === slug &&
              (!since || Date.parse(comment.updatedAt ?? comment.createdAt) > Date.parse(since))
          )
        )
      );
    },
    async get(slug, id) {
      const comment = parseComment(await kv.get(`${prefix}${slug}:${id}`));
      return comment?.slug === slug ? comment : undefined;
    },
    async put(comment) {
      await kv.put(`${prefix}${comment.slug}:${comment.id}`, JSON.stringify(comment));
    },
    async remove(slug, id) {
      await kv.delete(`${prefix}${slug}:${id}`);
    },
    async summary(slug) {
      return summaryOf(await this.list(slug));
    },
    async consumeRateLimit(bucket, now, limit, windowMs) {
      const key = `${ratePrefix}${bucket}`;
      let current: { start: number; count: number } | undefined;
      try {
        const raw = await kv.get(key);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'start' in parsed &&
            'count' in parsed
          ) {
            const start = Number(parsed.start);
            const count = Number(parsed.count);
            if (Number.isFinite(start) && Number.isFinite(count)) current = { start, count };
          }
        }
      } catch {
        // A damaged rate bucket resets rather than breaking comment reads.
      }
      const start = current && now < current.start + windowMs ? current.start : now;
      const count = current && start === current.start ? current.count + 1 : 1;
      await kv.put(key, JSON.stringify({ start, count }), {
        expirationTtl: Math.ceil((windowMs * 2) / 1000),
      });
      return count <= limit
        ? { allowed: true }
        : {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
          };
    },
  };
}

export const REVIEW_SERVER_LIMITS = {
  requestBytes: MAX_REQUEST_BYTES,
  bodyCharacters: REVIEW_LIMITS.bodyMaxChars,
  defaultWindowMs: DEFAULT_WINDOW_MS,
  defaultClientLimit: DEFAULT_CLIENT_LIMIT,
  defaultIpLimit: DEFAULT_IP_LIMIT,
} as const;
