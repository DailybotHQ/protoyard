import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReviewComment } from '@protoyard/core/review';
import {
  type CommentsStore,
  type ReviewSummary,
  validateReviewComment,
} from '@protoyard/review/server';
import { sortReviewComments } from '@protoyard/review/store';

const STORE_FORMAT = 'protoyard.quick-review';
const STORE_VERSION = 1;
const STORE_MAX_BYTES = 32 * 1024 * 1024;
const STORE_MAX_COMMENTS = 2_000;

interface StoredComments {
  format: typeof STORE_FORMAT;
  formatVersion: typeof STORE_VERSION;
  comments: ReviewComment[];
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

function parseStore(value: unknown, allowedSlugs: ReadonlySet<string>): StoredComments {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).format !== STORE_FORMAT ||
    (value as Record<string, unknown>).formatVersion !== STORE_VERSION ||
    !Array.isArray((value as Record<string, unknown>).comments)
  ) {
    throw new Error('The quick review store has an unsupported or invalid format.');
  }
  if (Object.keys(value).some((key) => !['format', 'formatVersion', 'comments'].includes(key))) {
    throw new Error('The quick review store has an unsupported or invalid format.');
  }
  const comments = (value as { comments: unknown[] }).comments;
  if (comments.length > STORE_MAX_COMMENTS) throw new Error('The quick review store is too large.');
  const checked: ReviewComment[] = [];
  const ids = new Set<string>();
  for (const value of comments) {
    const parsed = validateReviewComment(value);
    if (
      !parsed.success ||
      !allowedSlugs.has(parsed.data.slug) ||
      ids.has(`${parsed.data.slug}/${parsed.data.id}`)
    ) {
      throw new Error('The quick review store contains an invalid comment.');
    }
    ids.add(`${parsed.data.slug}/${parsed.data.id}`);
    checked.push(parsed.data);
  }
  return { format: STORE_FORMAT, formatVersion: STORE_VERSION, comments: checked };
}

/** File-backed review comments for one marked quick exploration. */
export function createFileCommentsStore(dir: string, slugs: readonly string[]): CommentsStore {
  const reviewDir = join(dir, 'review');
  const file = join(reviewDir, 'comments.json');
  const allowedSlugs = new Set(slugs);
  const comments = new Map<string, ReviewComment>();
  const commentKey = (slug: string, id: string) => `${slug}/${id}`;
  const limits = new Map<string, { start: number; count: number }>();
  let ready: Promise<void> | undefined;
  let writes = Promise.resolve();

  const load = async () => {
    if (!ready) {
      ready = (async () => {
        const folder = await lstat(reviewDir).catch(() => undefined);
        if (folder && (!folder.isDirectory() || folder.isSymbolicLink())) {
          throw new Error('Refusing a non-directory or symbolic link at the quick review folder.');
        }
        const entry = await lstat(file).catch(() => undefined);
        if (!entry) return;
        if (!entry.isFile() || entry.isSymbolicLink() || entry.size > STORE_MAX_BYTES) {
          throw new Error('Refusing an unsafe or oversized quick review store.');
        }
        const parsed = parseStore(
          JSON.parse(await readFile(file, 'utf8')) as unknown,
          allowedSlugs
        );
        for (const comment of parsed.comments) {
          comments.set(commentKey(comment.slug, comment.id), comment);
        }
      })();
    }
    await ready;
  };

  const persist = async () => {
    await mkdir(reviewDir, { recursive: true });
    const folder = await lstat(reviewDir);
    if (!folder.isDirectory() || folder.isSymbolicLink()) {
      throw new Error('Refusing a non-directory or symbolic link at the quick review folder.');
    }
    const existing = await lstat(file).catch(() => undefined);
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
      throw new Error('Refusing a non-file or symbolic link at the quick review store.');
    }
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    const value: StoredComments = {
      format: STORE_FORMAT,
      formatVersion: STORE_VERSION,
      comments: sortReviewComments([...comments.values()]),
    };
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(text) > STORE_MAX_BYTES)
      throw new Error('The quick review store is too large.');
    try {
      await writeFile(temp, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  };

  const mutate = async (operation: () => Promise<void>) => {
    await load();
    const next = writes.then(operation);
    writes = next.catch(() => undefined);
    await next;
  };

  return {
    async list(requestedSlug, since) {
      await load();
      if (!allowedSlugs.has(requestedSlug)) return [];
      return sortReviewComments([...comments.values()])
        .filter((comment) => comment.slug === requestedSlug)
        .filter(
          (comment) =>
            !since || Date.parse(comment.updatedAt ?? comment.createdAt) > Date.parse(since)
        )
        .map((comment) => structuredClone(comment));
    },
    async get(requestedSlug, id) {
      await load();
      const comment = allowedSlugs.has(requestedSlug)
        ? comments.get(commentKey(requestedSlug, id))
        : undefined;
      return comment ? structuredClone(comment) : undefined;
    },
    async put(comment) {
      if (!allowedSlugs.has(comment.slug))
        throw new Error('Comment slug does not match this exploration.');
      await mutate(async () => {
        const key = commentKey(comment.slug, comment.id);
        const previous = comments.get(key);
        comments.set(key, structuredClone(comment));
        try {
          await persist();
        } catch (error) {
          if (previous) comments.set(key, previous);
          else comments.delete(key);
          throw error;
        }
      });
    },
    async remove(requestedSlug, id) {
      if (!allowedSlugs.has(requestedSlug)) return;
      await mutate(async () => {
        const key = commentKey(requestedSlug, id);
        const previous = comments.get(key);
        comments.delete(key);
        try {
          await persist();
        } catch (error) {
          if (previous) comments.set(key, previous);
          throw error;
        }
      });
    },
    async summary(requestedSlug) {
      await load();
      return summaryOf(
        allowedSlugs.has(requestedSlug)
          ? [...comments.values()].filter((comment) => comment.slug === requestedSlug)
          : []
      );
    },
    async count(requestedSlug) {
      await load();
      return allowedSlugs.has(requestedSlug)
        ? [...comments.values()].filter((comment) => comment.slug === requestedSlug).length
        : 0;
    },
    async consumeRateLimit(key, now, limit, windowMs) {
      const current = limits.get(key);
      const start = current && now < current.start + windowMs ? current.start : now;
      const count = current && start === current.start ? current.count + 1 : 1;
      limits.set(key, { start, count });
      for (const [oldKey, value] of limits) {
        if (now >= value.start + windowMs && oldKey !== key) limits.delete(oldKey);
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
