import type { ReviewComment, ReviewCommentInput } from '@protoyard/core/review';
import { ReviewCommentSchema } from '@protoyard/core/review';
import { Dexie, liveQuery, reviewDatabaseName, type Table } from '@protoyard/database';
import { z } from 'zod';
import {
  createStamper,
  parseReviewComment,
  type ReviewAdapter,
  type ReviewAdapterInfo,
  sortReviewComments,
} from '../../store/index.ts';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const EXPORT_FORMAT = 'protoyard-review-comments';

const ReviewExportSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(1),
    namespace: z.string().regex(/^[a-z][a-z0-9-]*$/),
    slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    comments: z.array(ReviewCommentSchema),
  })
  .strict();

interface ReviewRow extends ReviewComment {
  id: string;
}

class LocalReviewDatabase extends Dexie {
  comments!: Table<ReviewRow, string>;

  constructor(
    namespace: string,
    options: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange }
  ) {
    super(reviewDatabaseName(namespace), options);
    this.version(1).stores({ comments: '&id, slug, [slug+createdAt], [slug+updatedAt]' });
  }
}

export interface LocalReviewAdapterOptions {
  /** The prototype storage namespace, independent of its data/control DBs. */
  namespace: string;
  /** Prototype slug in exported files (defaults to namespace). */
  slug?: string;
  /** The client identity used to authorize edits and deletes in this browser. */
  clientId: string;
  now?: () => number;
  /** Optional IndexedDB factory for isolated hosts and tests. */
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
}

export interface LocalReviewAdapter extends ReviewAdapter {
  /** A JSON file suitable for download or handing to another reviewer. */
  exportComments(): Promise<Blob>;
  /** Validates the complete file before merging; returns the number of new/updated rows. */
  importComments(file: Blob): Promise<number>;
  /** Closes this adapter's database connection (primarily for lifecycle management). */
  close(): void;
}

/**
 * Persistent, browser-local review comments. The `.review` database is separate
 * from the prototype's data and control databases, so scenario operations do
 * not reset or snapshot comments. Client ownership is a UX guard, not security.
 */
export function createLocalReviewAdapter(options: LocalReviewAdapterOptions): LocalReviewAdapter {
  if (!/^[a-z][a-z0-9-]*$/.test(options.namespace)) {
    throw new Error('Review database namespace must be a lowercase slug.');
  }
  if (!options.clientId.trim())
    throw new Error('A clientId is required for local review comments.');

  const db = new LocalReviewDatabase(options.namespace, {
    ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
    ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
  });
  const stamp = createStamper(options.now);
  const info: ReviewAdapterInfo = { kind: 'local', shared: false, live: true };
  const exportSlug = options.slug ?? options.namespace;

  return {
    info: () => ({ ...info }),
    async list(slug, { since } = {}) {
      const rows = await db.comments.where('slug').equals(slug).toArray();
      return sortReviewComments(
        rows.filter(
          (comment) =>
            !since || Date.parse(comment.updatedAt ?? comment.createdAt) > Date.parse(since)
        )
      ).map((comment) => structuredClone(comment));
    },
    async put(input: ReviewCommentInput) {
      const comment = parseReviewComment({ ...input, updatedAt: stamp() });
      return db.transaction('rw', db.comments, async () => {
        const existing = await db.comments.get(comment.id);
        if (existing && existing.author.clientId !== options.clientId) {
          throw new Error('Only the comment author can edit this review comment in this browser.');
        }
        if (existing && comment.author.clientId !== existing.author.clientId) {
          throw new Error('A review comment cannot be reassigned to another client.');
        }
        await db.comments.put(comment as ReviewRow);
        return structuredClone(comment);
      });
    },
    async remove(id) {
      await db.transaction('rw', db.comments, async () => {
        const existing = await db.comments.get(id);
        if (!existing) return;
        if (existing.author.clientId !== options.clientId) {
          throw new Error(
            'Only the comment author can delete this review comment in this browser.'
          );
        }
        await db.comments.delete(id);
      });
    },
    subscribe(slug, onChange) {
      const subscription = liveQuery(() =>
        db.comments.where('slug').equals(slug).toArray()
      ).subscribe({ next: () => onChange() });
      return () => subscription.unsubscribe();
    },
    async exportComments() {
      const comments = await db.comments.toArray();
      const payload = {
        format: EXPORT_FORMAT,
        version: 1,
        namespace: options.namespace,
        slug: exportSlug,
        comments: sortReviewComments(comments.filter((comment) => comment.slug === exportSlug)),
      };
      return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    },
    async importComments(file) {
      if (file.size > MAX_IMPORT_BYTES)
        throw new Error('Review comment import exceeds the 5 MB limit.');
      const text = await file.text();
      if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
        throw new Error('Review comment import exceeds the 5 MB limit.');
      }

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch (error) {
        throw new Error('Review comment import is not valid JSON.', { cause: error });
      }
      const parsed = ReviewExportSchema.parse(raw);
      if (parsed.namespace !== options.namespace) {
        throw new Error('Review comment import belongs to a different prototype namespace.');
      }
      if (
        parsed.slug !== exportSlug ||
        parsed.comments.some((comment) => comment.slug !== exportSlug)
      ) {
        throw new Error('Review comment import contains comments for a foreign slug.');
      }

      let merged = 0;
      await db.transaction('rw', db.comments, async () => {
        for (const comment of parsed.comments) {
          const existing = await db.comments.get(comment.id);
          if (!existing) {
            await db.comments.put(comment as ReviewRow);
            merged++;
            continue;
          }
          if (
            existing.author.clientId !== options.clientId ||
            comment.author.clientId !== options.clientId
          )
            continue;
          const currentStamp = Date.parse(existing.updatedAt ?? existing.createdAt);
          const incomingStamp = Date.parse(comment.updatedAt ?? comment.createdAt);
          if (incomingStamp > currentStamp) {
            await db.comments.put(comment as ReviewRow);
            merged++;
          }
        }
      });
      return merged;
    },
    close() {
      db.close();
    },
  };
}
