import type { ReviewComment, ReviewCommentInput } from '@protoyard/core/review';
import {
  changedSince,
  createStamper,
  parseReviewComment,
  type ReviewAdapter,
  type ReviewAdapterInfo,
  sortReviewComments,
} from './contract.ts';

/**
 * The reference adapter: comments in memory, gone on reload. It defines the
 * contract's behavior (the conformance suite runs against it) and serves
 * tests and demos. `live` notifies subscribers on every change.
 */
export function createMemoryReviewAdapter(
  options: { now?: () => number; info?: Partial<ReviewAdapterInfo> } = {}
): ReviewAdapter {
  const docs = new Map<string, ReviewComment>();
  const listeners = new Map<string, Set<() => void>>();
  const stamp = createStamper(options.now);
  const info: ReviewAdapterInfo = { kind: 'local', shared: false, live: true, ...options.info };
  const notify = (slug: string) => {
    for (const fn of listeners.get(slug) ?? []) fn();
  };
  // Copies keep callers from mutating stored documents.
  const copy = (c: ReviewComment) => structuredClone(c);
  return {
    async list(slug, { since } = {}) {
      return sortReviewComments(
        [...docs.values()].filter((c) => c.slug === slug && changedSince(c, since))
      ).map(copy);
    },
    async put(input: ReviewCommentInput) {
      const comment = parseReviewComment({ ...input, updatedAt: stamp() });
      docs.set(comment.id, comment);
      notify(comment.slug);
      return copy(comment);
    },
    async remove(id) {
      const existing = docs.get(id);
      if (!existing) return;
      docs.delete(id);
      notify(existing.slug);
    },
    info: () => ({ ...info }),
    subscribe(slug, onChange) {
      const set = listeners.get(slug) ?? new Set();
      set.add(onChange);
      listeners.set(slug, set);
      return () => set.delete(onChange);
    },
  };
}
