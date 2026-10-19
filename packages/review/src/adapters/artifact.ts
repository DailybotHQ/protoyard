import type { ReviewComment, ReviewCommentInput } from '@protoyard/core/review';
import {
  createStamper,
  parseReviewComment,
  type ReviewAdapter,
  type ReviewAdapterInfo,
} from '../store/index.ts';

export type ArtifactCapability = 'db' | 'user';

export interface ArtifactDocumentSnapshot {
  id: string;
  exists: boolean;
  data: Record<string, unknown>;
}

export interface ArtifactCollectionSnapshot {
  docs: ArtifactDocumentSnapshot[];
}

export interface ArtifactDocumentReference {
  get(): Promise<ArtifactDocumentSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(
    onChange: (snapshot: ArtifactDocumentSnapshot) => void,
    onError?: (error: unknown) => void
  ): () => void;
}

export interface ArtifactCollectionReference {
  get(): Promise<ArtifactCollectionSnapshot>;
  onSnapshot(
    onChange: (snapshot: ArtifactCollectionSnapshot) => void,
    onError?: (error: unknown) => void
  ): () => void;
}

export interface ArtifactDatabase {
  collection(path: string): ArtifactCollectionReference;
  doc(path: string): ArtifactDocumentReference;
}

export interface ArtifactProfile {
  displayName?: string;
  name?: string;
}

export interface ArtifactUser {
  id(): string;
  profiles(ids: readonly string[]): Promise<Record<string, ArtifactProfile>>;
  can(permission: 'data.write'): boolean | null;
}

export interface ArtifactClaude {
  use(capability: ArtifactCapability): Promise<ArtifactDatabase | ArtifactUser | null>;
}

export type ArtifactErrorCode =
  | 'invalid_argument'
  | 'forbidden'
  | 'quota_exceeded'
  | 'resource_exhausted'
  | 'revoked'
  | 'unavailable'
  | (string & {});

/** Artifact failures retain their capability code so the UI can offer a fresh-gesture retry. */
export class ArtifactReviewError extends Error {
  readonly code: ArtifactErrorCode;
  readonly retryFromGesture: boolean;

  constructor(code: ArtifactErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArtifactReviewError';
    this.code = code;
    this.retryFromGesture =
      code === 'quota_exceeded' ||
      code === 'resource_exhausted' ||
      code === 'revoked' ||
      code === 'unavailable';
  }
}

interface StoredReviewComment {
  anchor?: unknown;
  route?: unknown;
  context?: unknown;
  text?: unknown;
  authorId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  editedAt?: unknown;
  status?: unknown;
  resolvedAt?: unknown;
  resolvedById?: unknown;
  reactions?: unknown;
}

const COLLECTIONS_PER_VIEW = 64;
const PERMISSION_ERROR = 'invalid_argument';
export const LOCAL_REVIEW_FALLBACK_NOTICE = 'Comments are saved only in your browser here';

function errorCode(error: unknown): ArtifactErrorCode {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string') return code;
  }
  return 'unavailable';
}

function toArtifactError(error: unknown): ArtifactReviewError {
  if (error instanceof ArtifactReviewError) return error;
  const code = errorCode(error);
  const messages: Record<string, string> = {
    invalid_argument: 'Artifact access is read-only for this visit.',
    forbidden: 'This artifact viewer cannot write shared comments.',
    quota_exceeded: 'Artifact comment storage is full.',
    resource_exhausted: 'Artifact comment storage is temporarily exhausted.',
    revoked: 'Artifact access was revoked. Reopen the artifact to try again.',
    unavailable: 'Artifact comment storage is temporarily unavailable.',
  };
  return new ArtifactReviewError(code, messages[code] ?? 'Artifact comment storage failed.', {
    cause: error,
  });
}

function browserClaude(): ArtifactClaude | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { claude?: ArtifactClaude }).claude;
}

function snapshotData(snapshot: ArtifactDocumentSnapshot): Record<string, unknown> | undefined {
  return snapshot.exists ? snapshot.data : undefined;
}

function safeClientId(authorId: string): string {
  const normalized = authorId.replace(/[^A-Za-z0-9_:.-]/g, '-');
  const clientId = `artifact-${normalized}`;
  return clientId.length <= 128 ? clientId : `artifact-${hashId(authorId)}`;
}

function hashId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(8, '0');
}

function profileName(profile: ArtifactProfile | undefined): string {
  return profile?.displayName || profile?.name || 'Someone';
}

function commentPath(slug: string, threadId: string, commentId: string): string {
  return `review/${slug}/threads/${threadId}${threadId === commentId ? '' : `/replies/${commentId}`}`;
}

function replyCollectionPath(slug: string, threadId: string): string {
  return `review/${slug}/threads/${threadId}/replies`;
}

function collectionDocs(snapshot: ArtifactCollectionSnapshot): ArtifactDocumentSnapshot[] {
  return Array.isArray(snapshot.docs) ? snapshot.docs : [];
}

function serializeByPath<T>(
  queue: Map<string, Promise<unknown>>,
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = queue.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  queue.set(
    path,
    current.catch(() => undefined)
  );
  return current;
}

export interface ArtifactReviewAdapter extends ReviewAdapter {
  /** `null` means the capability has not provided an answer; keep the composer visible. */
  canWrite(): boolean | null;
  subscribe(
    slug: string,
    onChange: () => void,
    onError?: (error: ArtifactReviewError) => void
  ): () => void;
}

/** Creates the shared adapter after both Artifact capabilities have been granted. */
export async function createArtifactReviewAdapter(
  fallback: ReviewAdapter,
  claude: ArtifactClaude | undefined = browserClaude()
): Promise<ReviewAdapter> {
  if (typeof claude?.use !== 'function') return fallback;
  try {
    const [database, identity] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!database || !identity || !('collection' in database) || !('id' in identity)) {
      return fallback;
    }
    return createArtifactReviewAdapterFromCapabilities(database, identity);
  } catch {
    return fallback;
  }
}

/** Adapter factory kept separate so capability-only hosts can be tested without a browser global. */
export function createArtifactReviewAdapterFromCapabilities(
  db: ArtifactDatabase,
  user: ArtifactUser
): ArtifactReviewAdapter {
  const stamp = createStamper();
  const writes = new Map<string, Promise<unknown>>();
  const knownSlugs = new Set<string>();
  const commentSlugs = new Map<string, string>();
  let visitReadOnly = false;

  async function namesFor(authorIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(authorIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const profiles = await user.profiles(ids);
    return new Map(ids.map((id) => [id, profileName(profiles[id])]));
  }

  async function commentsInThread(
    slug: string,
    threadId: string
  ): Promise<Array<{ id: string; data: StoredReviewComment }>> {
    const threadPath = commentPath(slug, threadId, threadId);
    const rootSnapshot = await db.doc(threadPath).get();
    const rootData = snapshotData(rootSnapshot);
    if (!rootData) return [];
    const repliesSnapshot = await db.collection(replyCollectionPath(slug, threadId)).get();
    const comments = [{ id: threadId, data: rootData as StoredReviewComment }];
    for (const reply of collectionDocs(repliesSnapshot)) {
      const data = snapshotData(reply);
      if (data) comments.push({ id: reply.id, data: data as StoredReviewComment });
    }
    return comments;
  }

  async function findComment(
    id: string
  ): Promise<{ slug: string; threadId: string; path: string } | undefined> {
    const knownSlug = commentSlugs.get(id);
    const slugs = knownSlug ? [knownSlug] : [...knownSlugs];
    for (const slug of slugs) {
      const rootPath = commentPath(slug, id, id);
      const root = snapshotData(await db.doc(rootPath).get());
      if (root) return { slug, threadId: id, path: rootPath };
      const roots = collectionDocs(await db.collection(`review/${slug}/threads`).get());
      for (const thread of roots) {
        const path = commentPath(slug, thread.id, id);
        if (snapshotData(await db.doc(path).get())) return { slug, threadId: thread.id, path };
      }
    }
    return undefined;
  }

  function canWrite(): boolean | null {
    if (visitReadOnly) return false;
    try {
      const allowed = user.can('data.write');
      if (allowed === false) visitReadOnly = true;
      return allowed;
    } catch (error) {
      const wrapped = toArtifactError(error);
      if (wrapped.code === PERMISSION_ERROR) {
        visitReadOnly = true;
        return false;
      }
      throw wrapped;
    }
  }

  async function actor(): Promise<{ id: string; name: string; author: ReviewComment['author'] }> {
    const id = user.id();
    const profiles = await namesFor([id]);
    const name = profiles.get(id) || 'Someone';
    return { id, name, author: { name, clientId: safeClientId(id) } };
  }

  function storeComment(
    comment: ReviewComment,
    authorId: string,
    updatedAt: string
  ): Record<string, unknown> {
    return {
      ...(comment.anchor ? { anchor: comment.anchor } : {}),
      ...(comment.anchor?.route ? { route: comment.anchor.route } : {}),
      ...(comment.context ? { context: comment.context } : {}),
      text: comment.body,
      authorId,
      createdAt: comment.createdAt,
      updatedAt,
      ...(comment.editedAt ? { editedAt: comment.editedAt } : {}),
      status: comment.id === comment.threadId && comment.resolvedAt ? 'resolved' : 'open',
      ...(comment.resolvedAt ? { resolvedAt: comment.resolvedAt, resolvedById: authorId } : {}),
      ...(comment.reactions ? { reactions: comment.reactions } : {}),
    };
  }

  async function toReviewComment(
    id: string,
    threadId: string,
    slug: string,
    data: StoredReviewComment,
    profiles: Map<string, string>,
    resolvedByName?: string
  ): Promise<ReviewComment | undefined> {
    if (
      typeof data.authorId !== 'string' ||
      typeof data.text !== 'string' ||
      typeof data.createdAt !== 'string'
    ) {
      return undefined;
    }
    const resolved = data.status === 'resolved';
    const value = {
      formatVersion: 1,
      id,
      threadId,
      slug,
      body: data.text,
      author: {
        name: profiles.get(data.authorId) || 'Someone',
        clientId: safeClientId(data.authorId),
      },
      createdAt: data.createdAt,
      ...(typeof data.updatedAt === 'string' ? { updatedAt: data.updatedAt } : {}),
      ...(typeof data.editedAt === 'string' ? { editedAt: data.editedAt } : {}),
      ...(id === threadId && data.anchor ? { anchor: data.anchor } : {}),
      ...(id === threadId && data.context ? { context: data.context } : {}),
      ...(data.reactions ? { reactions: data.reactions } : {}),
      ...(id === threadId && resolved
        ? {
            resolvedAt:
              typeof data.resolvedAt === 'string'
                ? data.resolvedAt
                : typeof data.updatedAt === 'string'
                  ? data.updatedAt
                  : data.createdAt,
            ...(typeof data.resolvedById === 'string'
              ? {
                  resolvedBy: {
                    name: resolvedByName || 'Someone',
                    clientId: safeClientId(data.resolvedById),
                  },
                }
              : {}),
          }
        : {}),
    };
    try {
      return parseReviewComment(value);
    } catch {
      return undefined;
    }
  }

  const adapter: ArtifactReviewAdapter = {
    canWrite,
    info(): ReviewAdapterInfo {
      return { kind: 'artifact', shared: true, live: true };
    },
    async list(slug, options = {}) {
      knownSlugs.add(slug);
      try {
        const roots = collectionDocs(await db.collection(`review/${slug}/threads`).get());
        const stored: Array<{ id: string; threadId: string; data: StoredReviewComment }> = [];
        for (const root of roots) {
          const comments = await commentsInThread(slug, root.id);
          stored.push(...comments.map((comment) => ({ ...comment, threadId: root.id })));
          for (const comment of comments) commentSlugs.set(comment.id, slug);
        }
        const authorIds = stored.flatMap(({ data }) => [
          ...(typeof data.authorId === 'string' ? [data.authorId] : []),
          ...(typeof data.resolvedById === 'string' ? [data.resolvedById] : []),
        ]);
        const profiles = await namesFor(authorIds);
        const comments: ReviewComment[] = [];
        for (const row of stored) {
          const resolvedByName =
            typeof row.data.resolvedById === 'string'
              ? profiles.get(row.data.resolvedById)
              : undefined;
          const comment = await toReviewComment(
            row.id,
            row.threadId,
            slug,
            row.data,
            profiles,
            resolvedByName
          );
          if (
            comment &&
            (!options.since ||
              Date.parse(comment.updatedAt ?? comment.createdAt) > Date.parse(options.since))
          ) {
            comments.push(comment);
          }
        }
        comments.sort((a, b) => {
          const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt);
          return delta || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        });
        return comments;
      } catch (error) {
        throw toArtifactError(error);
      }
    },
    async put(input: ReviewCommentInput) {
      const parsed = parseReviewComment(input);
      const allowed = canWrite();
      if (allowed === false)
        throw new ArtifactReviewError(
          'forbidden',
          'This artifact viewer cannot write shared comments.'
        );
      const actorInfo = await actor();
      knownSlugs.add(parsed.slug);
      commentSlugs.set(parsed.id, parsed.slug);
      const path = commentPath(parsed.slug, parsed.threadId, parsed.id);
      return serializeByPath(writes, path, async () => {
        try {
          const updatedAt = stamp();
          const comment = parseReviewComment({
            ...parsed,
            author: actorInfo.author,
            updatedAt,
            ...(parsed.resolvedAt ? { resolvedBy: actorInfo.author } : {}),
          });
          await db.doc(path).set(storeComment(comment, actorInfo.id, updatedAt));
          return comment;
        } catch (error) {
          const wrapped = toArtifactError(error);
          if (wrapped.code === PERMISSION_ERROR) visitReadOnly = true;
          throw wrapped;
        }
      });
    },
    async remove(id) {
      const allowed = canWrite();
      if (allowed === false)
        throw new ArtifactReviewError(
          'forbidden',
          'This artifact viewer cannot write shared comments.'
        );
      try {
        const found = await findComment(id);
        if (!found) return;
        await serializeByPath(writes, found.path, async () => {
          if (found.threadId === id) {
            const replies = collectionDocs(
              await db.collection(replyCollectionPath(found.slug, id)).get()
            );
            for (const reply of replies) {
              const replyPath = commentPath(found.slug, id, reply.id);
              await serializeByPath(writes, replyPath, () => db.doc(replyPath).delete());
            }
          }
          await db.doc(found.path).delete();
        });
      } catch (error) {
        const wrapped = toArtifactError(error);
        if (wrapped.code === PERMISSION_ERROR) visitReadOnly = true;
        throw wrapped;
      }
    },
    subscribe(slug, onChange, onError) {
      knownSlugs.add(slug);
      const rootsPath = `review/${slug}/threads`;
      const subscriptions = new Map<string, () => void>();
      let closed = false;
      let syncing: Promise<void> = Promise.resolve();
      const reportError = (error: unknown) => {
        const wrapped = toArtifactError(error);
        if (wrapped.code === PERMISSION_ERROR) visitReadOnly = true;
        onError?.(wrapped);
      };
      const syncReplies = () => {
        syncing = syncing
          .catch(() => undefined)
          .then(async () => {
            if (closed) return;
            const roots = collectionDocs(await db.collection(rootsPath).get());
            const wanted = new Set(roots.slice(0, COLLECTIONS_PER_VIEW - 1).map((root) => root.id));
            for (const [threadId, unsubscribe] of subscriptions) {
              if (!wanted.has(threadId)) {
                unsubscribe();
                subscriptions.delete(threadId);
              }
            }
            for (const threadId of wanted) {
              if (subscriptions.has(threadId) || closed) continue;
              const unsubscribe = db
                .collection(replyCollectionPath(slug, threadId))
                .onSnapshot(() => onChange(), reportError);
              subscriptions.set(threadId, unsubscribe);
            }
          })
          .catch(reportError);
      };
      const unsubscribeRoots = db.collection(rootsPath).onSnapshot(() => {
        if (closed) return;
        onChange();
        syncReplies();
      }, reportError);
      syncReplies();
      return () => {
        closed = true;
        unsubscribeRoots();
        for (const unsubscribe of subscriptions.values()) unsubscribe();
        subscriptions.clear();
      };
    },
  };
  return adapter;
}
