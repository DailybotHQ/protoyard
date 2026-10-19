import {
  type ReviewComment,
  type ReviewCommentInput,
  ReviewCommentSchema,
  safeParseReviewComment,
} from '@protoyard/core/review';

export type ReviewAdapterKind = 'local' | 'cloudflare' | 'http' | 'artifact';

export interface ReviewAdapterInfo {
  kind: ReviewAdapterKind;
  /** Other people see these comments (false: only this browser). */
  shared: boolean;
  /** `subscribe` pushes changes (false: poll with `list`). */
  live: boolean;
}

export interface ReviewListOptions {
  /** Only comments whose `updatedAt` is after this ISO instant (for polling). */
  since?: string;
}

/**
 * Where review comments live: documents keyed by id, last write wins on an
 * `updatedAt` the adapter (or its server) stamps. Edits, resolve and reopen
 * are `put` of the whole comment, so any document store fits. Permissions
 * (editing only your own comments) belong to the UI and server, not here.
 */
export interface ReviewAdapter {
  /** A prototype's comments, oldest first (by `createdAt`, then id). */
  list(slug: string, options?: ReviewListOptions): Promise<ReviewComment[]>;
  /** Creates or replaces the comment with this id; resolves with the stored copy (stamped `updatedAt`). Rejects invalid comments. */
  put(comment: ReviewCommentInput): Promise<ReviewComment>;
  /** Deletes a comment; removing a missing id resolves too. */
  remove(id: string): Promise<void>;
  info(): ReviewAdapterInfo;
  /** Calls `onChange` when the slug's comments change; returns the unsubscribe. */
  subscribe?(slug: string, onChange: () => void): () => void;
}

/** Validates a comment going into storage (zod; throws on invalid input). */
export function parseReviewComment(input: unknown): ReviewComment {
  return ReviewCommentSchema.parse(input);
}

/** Keeps only valid comments read back from storage or the network (untrusted). */
export function acceptStoredComments(rows: readonly unknown[]): ReviewComment[] {
  const out: ReviewComment[] = [];
  for (const row of rows) {
    const parsed = safeParseReviewComment(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Oldest first: by `createdAt`, then id. Returns a new array. */
export function sortReviewComments(comments: readonly ReviewComment[]): ReviewComment[] {
  return [...comments].sort((a, b) => {
    const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** True when the comment changed after `since` (uses `updatedAt`, else `createdAt`). */
export function changedSince(comment: ReviewComment, since: string | undefined): boolean {
  if (!since) return true;
  return Date.parse(comment.updatedAt ?? comment.createdAt) > Date.parse(since);
}

/**
 * A strictly increasing stamp: the clock, or 1 ms after the previous stamp
 * when the clock has not moved (several writes in one millisecond).
 */
export function createStamper(now: () => number = () => Date.now()): () => string {
  let last = 0;
  return () => {
    last = Math.max(now(), last + 1);
    return new Date(last).toISOString();
  };
}

/**
 * Calls `onChange` when a slug's comments change: through `subscribe` when
 * the adapter is live, otherwise by polling `list` and comparing ids and
 * stamps (so removals are noticed too). Returns the stop function.
 */
export function watchReviewComments(
  adapter: ReviewAdapter,
  slug: string,
  onChange: () => void,
  options: { intervalMs?: number } = {}
): () => void {
  if (adapter.subscribe && adapter.info().live) return adapter.subscribe(slug, onChange);
  let signature: string | null = null;
  let stopped = false;
  const check = async () => {
    try {
      const rows = await adapter.list(slug);
      const next = rows.map((c) => `${c.id}@${c.updatedAt ?? c.createdAt}`).join('|');
      if (signature !== null && next !== signature && !stopped) onChange();
      signature = next;
    } catch {
      // Offline or failing: try again on the next tick.
    }
  };
  void check();
  const timer = setInterval(() => void check(), options.intervalMs ?? 5000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
