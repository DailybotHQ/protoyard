import { z } from 'zod';
import { OrientationSchema } from './devices.ts';
import { ColorModeSchema, ShellSchema, SlugSchema } from './manifest.ts';

/**
 * Review comments contract (ADR-025), shared by `@protoyard/review`, its
 * adapters, the comments Function and the CLI. Import it from the
 * `@protoyard/core/review` subpath: it is deliberately not re-exported from
 * the core barrel, so builds without review pay nothing for these schemas.
 *
 * Comments are untrusted plain text. Nothing here interprets markup; every
 * consumer renders bodies and names as text (never `{@html}`), and links are
 * filtered by the UI. Timestamps are the reviewer's wall clock (ISO 8601),
 * not the prototype's simulated clock: they are facts about the review, not
 * world data, so the determinism rule for generators does not apply.
 */

export const REVIEW_FORMAT_VERSION = 1;

export const REVIEW_LIMITS = {
  bodyMaxChars: 2000,
  nameMaxChars: 60,
  /** Distinct reaction kinds per comment. */
  reactionKinds: 20,
  /** Reviewers per reaction kind. */
  reactionsPerKind: 200,
  locators: 5,
  locatorMaxChars: 500,
  fingerprintMaxChars: 120,
  routeMaxChars: 500,
} as const;

/**
 * C0/C1 control characters (except tab, newline and carriage return) and
 * bidi embedding/override/isolate controls, which can disguise text.
 */
function isBidiControl(code: number): boolean {
  return (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/** True when text has a disallowed control: tab, LF and CR are allowed. */
function hasUnsafeText(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (isControl(code) || isBidiControl(code)) return true;
  }
  return false;
}

/** Names are single-line: no controls at all, no line or paragraph separators. */
function hasUnsafeName(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (isControl(code) || isBidiControl(code) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

/** Client-generated id (a ULID in practice): 10–64 URL-safe characters. */
export const ReviewIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{10,64}$/, { message: 'id must be 10-64 URL-safe characters' });

/** A random per-browser id (or the artifact `user.id()`), never a real identity. */
export const ReviewClientIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_:.-]{8,128}$/, { message: 'clientId must be 8-128 safe characters' });

const IsoInstantSchema = z
  .string()
  .max(40)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'timestamp must be an ISO 8601 instant',
  })
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'timestamp must be a valid date' });

/**
 * Self-declared display name plus a per-browser client id. This is not
 * authentication: anyone can type any name.
 */
export const ReviewAuthorSchema = z
  .object({
    name: z
      .string()
      .max(REVIEW_LIMITS.nameMaxChars)
      .refine((v) => v.trim().length > 0, { message: 'name must not be blank' })
      .refine((v) => !hasUnsafeName(v), { message: 'name has control characters' }),
    clientId: ReviewClientIdSchema,
  })
  .strict();
export type ReviewAuthor = z.infer<typeof ReviewAuthorSchema>;

export const ReviewBodySchema = z
  .string()
  .max(REVIEW_LIMITS.bodyMaxChars)
  .refine((v) => v.trim().length > 0, { message: 'comment must not be blank' })
  .refine((v) => !hasUnsafeText(v), { message: 'comment has control characters' });

/**
 * Element locator ladder, strongest first: an explicit `data-py-anchor`, a
 * `data-testid`, a stable element id, a role + accessible-name path from the
 * nearest landmark, then a CSS `nth-of-type` path.
 */
export const ReviewLocatorKindSchema = z.enum([
  'py-anchor',
  'test-id',
  'id',
  'role-path',
  'css-path',
]);
export type ReviewLocatorKind = z.infer<typeof ReviewLocatorKindSchema>;

const RouteSchema = z
  .string()
  .max(REVIEW_LIMITS.routeMaxChars)
  .regex(/^\//, { message: 'route must start with /' });

/** Where a pin sits: route, element locators, a text fingerprint and an element-relative offset. */
export const ReviewAnchorSchema = z
  .object({
    route: z.object({ pattern: RouteSchema, path: RouteSchema }).strict(),
    locators: z
      .array(
        z
          .object({
            kind: ReviewLocatorKindSchema,
            value: z.string().min(1).max(REVIEW_LIMITS.locatorMaxChars),
          })
          .strict()
      )
      .min(1)
      .max(REVIEW_LIMITS.locators),
    /** Short visible text of the element, used to verify a match. */
    fingerprint: z.string().max(REVIEW_LIMITS.fingerprintMaxChars).optional(),
    /** 0–1 on each axis, relative to the element's box (scale-independent). */
    offset: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
  })
  .strict();
export type ReviewAnchor = z.infer<typeof ReviewAnchorSchema>;

const KebabIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);

/** What the reviewer was looking at when the thread was opened. */
export const ReviewContextSchema = z
  .object({
    scenario: KebabIdSchema.optional(),
    persona: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
    shell: ShellSchema.optional(),
    orientation: OrientationSchema.optional(),
    theme: KebabIdSchema.optional(),
    mode: ColorModeSchema.optional(),
    layout: KebabIdSchema.optional(),
    viewport: z
      .object({
        width: z.number().int().min(1).max(20000),
        height: z.number().int().min(1).max(20000),
      })
      .strict(),
    buildId: z.string().min(1).max(80).optional(),
  })
  .strict();
export type ReviewContext = z.infer<typeof ReviewContextSchema>;

/**
 * One comment document. A thread is a root comment (`threadId === id`, with
 * `anchor` and `context`) plus replies that point at it. Edits, resolve and
 * reopen are a whole-document upsert by id; `updatedAt` is stamped by the
 * adapter or server for last-write-wins.
 */
export const ReviewCommentSchema = z
  .object({
    formatVersion: z.literal(REVIEW_FORMAT_VERSION).default(REVIEW_FORMAT_VERSION),
    id: ReviewIdSchema,
    threadId: ReviewIdSchema,
    slug: SlugSchema,
    body: ReviewBodySchema,
    author: ReviewAuthorSchema,
    createdAt: IsoInstantSchema,
    updatedAt: IsoInstantSchema.optional(),
    editedAt: IsoInstantSchema.optional(),
    resolvedAt: IsoInstantSchema.optional(),
    resolvedBy: ReviewAuthorSchema.optional(),
    anchor: ReviewAnchorSchema.optional(),
    context: ReviewContextSchema.optional(),
    /** Reaction kind → client ids that reacted. */
    reactions: z
      .record(
        z.string().min(1).max(16),
        z.array(ReviewClientIdSchema).max(REVIEW_LIMITS.reactionsPerKind)
      )
      .refine((r) => Object.keys(r).length <= REVIEW_LIMITS.reactionKinds, {
        message: `at most ${REVIEW_LIMITS.reactionKinds} reaction kinds`,
      })
      .optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.id !== c.threadId) return;
    if (!c.anchor)
      ctx.addIssue({ code: 'custom', path: ['anchor'], message: 'a thread root needs an anchor' });
    if (!c.context)
      ctx.addIssue({ code: 'custom', path: ['context'], message: 'a thread root needs a context' });
  });
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export type ReviewCommentInput = z.input<typeof ReviewCommentSchema>;

/** Validates untrusted input (a file, a network response) without throwing. */
export function safeParseReviewComment(input: unknown) {
  return ReviewCommentSchema.safeParse(input);
}

export const ReviewThreadStatusSchema = z.enum(['open', 'resolved']);
export type ReviewThreadStatus = z.infer<typeof ReviewThreadStatusSchema>;

/** A derived view: the root comment, its replies in order, and the status. */
export const ReviewThreadSchema = z
  .object({
    formatVersion: z.literal(REVIEW_FORMAT_VERSION),
    id: ReviewIdSchema,
    slug: SlugSchema,
    status: ReviewThreadStatusSchema,
    root: ReviewCommentSchema,
    replies: z.array(ReviewCommentSchema),
  })
  .strict();
export type ReviewThread = z.infer<typeof ReviewThreadSchema>;

function byCreation(a: ReviewComment, b: ReviewComment): number {
  const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Groups validated comments into threads, ordered by creation time then id
 * (stable across adapters). Replies whose root is missing are returned as
 * `orphans` rather than dropped.
 */
export function groupReviewThreads(comments: readonly ReviewComment[]): {
  threads: ReviewThread[];
  orphans: ReviewComment[];
} {
  const sorted = [...comments].sort(byCreation);
  const threads = new Map<string, ReviewThread>();
  for (const c of sorted) {
    if (c.id !== c.threadId) continue;
    threads.set(c.id, {
      formatVersion: REVIEW_FORMAT_VERSION,
      id: c.id,
      slug: c.slug,
      status: c.resolvedAt ? 'resolved' : 'open',
      root: c,
      replies: [],
    });
  }
  const orphans: ReviewComment[] = [];
  for (const c of sorted) {
    if (c.id === c.threadId) continue;
    const thread = threads.get(c.threadId);
    if (thread) thread.replies.push(c);
    else orphans.push(c);
  }
  return { threads: [...threads.values()], orphans };
}
