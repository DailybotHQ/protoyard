/** `@protoyard/review/report` — portable review comment files and safe Markdown reports. */
import {
  groupReviewThreads,
  type ReviewComment,
  ReviewCommentSchema,
} from '@protoyard/core/review';
import { z } from 'zod';
import { sortReviewComments } from '../store/index.ts';

export const REVIEW_COMMENTS_FORMAT = 'protoyard-review-comments';
export const REVIEW_COMMENTS_VERSION = 1;

const NamespaceSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** The exact JSON envelope written by the local IndexedDB adapter. */
export const ReviewCommentsFileSchema = z
  .object({
    format: z.literal(REVIEW_COMMENTS_FORMAT),
    version: z.literal(REVIEW_COMMENTS_VERSION),
    namespace: NamespaceSchema,
    slug: NamespaceSchema,
    comments: z.array(ReviewCommentSchema),
  })
  .strict();
export type ReviewCommentsFile = z.infer<typeof ReviewCommentsFileSchema>;

/** Workspace sidecar adds pull provenance without changing the adapter file format. */
export const PulledReviewCommentsSchema = z
  .object({
    format: z.literal(REVIEW_COMMENTS_FORMAT),
    version: z.literal(REVIEW_COMMENTS_VERSION),
    namespace: NamespaceSchema,
    slug: NamespaceSchema,
    pulledAt: z.string().datetime({ offset: true }),
    comments: z.array(ReviewCommentSchema),
  })
  .strict();
export type PulledReviewComments = z.infer<typeof PulledReviewCommentsSchema>;

function checkedComments(slug: string, comments: readonly unknown[]): ReviewComment[] {
  const parsed = comments.map((comment) => ReviewCommentSchema.parse(comment));
  if (parsed.some((comment) => comment.slug !== slug)) {
    throw new Error(`Review comments file contains a comment for a different slug than "${slug}".`);
  }
  const ids = new Set<string>();
  for (const comment of parsed) {
    if (ids.has(comment.id))
      throw new Error(`Review comments file repeats comment id "${comment.id}".`);
    ids.add(comment.id);
  }
  return sortReviewComments(parsed);
}

/** Validate and normalize a local adapter export. */
export function parseReviewCommentsFile(
  value: unknown,
  expected?: { slug?: string; namespace?: string }
): ReviewCommentsFile {
  const file = ReviewCommentsFileSchema.parse(value);
  if (expected?.slug && file.slug !== expected.slug) {
    throw new Error(`Review comments file is for "${file.slug}", not "${expected.slug}".`);
  }
  if (expected?.namespace && file.namespace !== expected.namespace) {
    throw new Error(
      `Review comments file belongs to namespace "${file.namespace}", not "${expected.namespace}".`
    );
  }
  return { ...file, comments: checkedComments(file.slug, file.comments) };
}

/** Create the exact local adapter JSON envelope from validated comments. */
export function createReviewCommentsFile(input: {
  namespace: string;
  slug: string;
  comments: readonly unknown[];
}): ReviewCommentsFile {
  return parseReviewCommentsFile({
    format: REVIEW_COMMENTS_FORMAT,
    version: REVIEW_COMMENTS_VERSION,
    namespace: input.namespace,
    slug: input.slug,
    comments: input.comments,
  });
}

/** Create the workspace sidecar; `pulledAt` is an observed wall-clock timestamp. */
export function createPulledReviewComments(input: {
  namespace: string;
  slug: string;
  comments: readonly unknown[];
  pulledAt?: string;
}): PulledReviewComments {
  return PulledReviewCommentsSchema.parse({
    ...createReviewCommentsFile(input),
    pulledAt: input.pulledAt ?? new Date().toISOString(),
  });
}

/** Strip workspace-only provenance for import into the browser-local adapter. */
export function toReviewCommentsFile(
  value: unknown,
  expected?: { slug?: string; namespace?: string }
): ReviewCommentsFile {
  const pulled = PulledReviewCommentsSchema.safeParse(value);
  if (pulled.success) {
    const { format, version, namespace, slug, comments } = pulled.data;
    return parseReviewCommentsFile({ format, version, namespace, slug, comments }, expected);
  }
  return parseReviewCommentsFile(value, expected);
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\')
    .replaceAll(/([`*_{}[\]()#+.!|~-])/g, '\\$1');
}

function inlineCode(value: string): string {
  const runs = value.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(1, ...runs.map((run) => run.length + 1)));
  const padding = value.startsWith(' ') || value.endsWith(' ') ? ' ' : '';
  return `${fence}${padding}${value}${padding}${fence}`;
}

function quotedBody(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => `> ${escapeMarkdown(line) || ' '}`)
    .join('\n');
}

function deepLink(comment: ReviewComment): string | undefined {
  const route = comment.anchor?.route.path;
  if (!route) return undefined;
  const params = new URLSearchParams();
  if (comment.context?.scenario) params.set('scenario', comment.context.scenario);
  if (comment.context?.shell) params.set('shell', comment.context.shell);
  if (comment.context?.theme) params.set('theme', comment.context.theme);
  const query = params.toString();
  const safeRoute = encodeURIComponent(route).replaceAll('%2F', '/');
  return `${query ? `?${query}` : ''}#${safeRoute}`;
}

function commentSection(comment: ReviewComment, label: string): string[] {
  const lines = [
    `#### ${escapeMarkdown(label)} — ${escapeMarkdown(comment.author.name)}`,
    '',
    quotedBody(comment.body),
  ];
  const route = comment.anchor?.route.path;
  if (route) lines.push('', `- **Route:** ${inlineCode(route)}`);
  if (comment.anchor) {
    const locators = comment.anchor.locators
      .map((locator) => `${locator.kind}: ${locator.value}`)
      .join('; ');
    lines.push(`- **Anchor:** ${inlineCode(locators)}`);
    if (comment.anchor.fingerprint) {
      lines.push(`- **Element text:** ${inlineCode(comment.anchor.fingerprint)}`);
    }
  }
  if (comment.context) {
    const { scenario, persona, shell, orientation, theme, mode, layout, viewport, buildId } =
      comment.context;
    const context = Object.fromEntries(
      Object.entries({
        scenario,
        persona,
        shell,
        orientation,
        theme,
        mode,
        layout,
        viewport,
        buildId,
      }).filter(([, value]) => value !== undefined)
    );
    lines.push(`- **Context:** ${inlineCode(JSON.stringify(context))}`);
  }
  const link = deepLink(comment);
  if (link) lines.push(`- **Deep link:** [Open this view](${link})`);
  lines.push(`- **Created:** ${inlineCode(comment.createdAt)}`);
  return lines;
}

/** Render a deterministic, injection-safe Markdown report from validated comments. */
export function renderReviewMarkdown(input: {
  slug: string;
  comments: readonly ReviewComment[];
  pulledAt: string;
}): string {
  const comments = checkedComments(input.slug, input.comments);
  const { threads, orphans } = groupReviewThreads(comments);
  const ordered = [
    ...threads.filter((thread) => thread.status === 'open'),
    ...threads.filter((thread) => thread.status === 'resolved'),
  ];
  const byRoute = new Map<string, typeof ordered>();
  for (const thread of ordered) {
    const route = thread.root.anchor?.route.path ?? '(route unavailable)';
    const group = byRoute.get(route) ?? [];
    group.push(thread);
    byRoute.set(route, group);
  }

  const lines = [
    `# Review comments: ${escapeMarkdown(input.slug)}`,
    '',
    `Pulled at ${inlineCode(input.pulledAt)}.`,
    '',
    `Open threads: ${threads.filter((thread) => thread.status === 'open').length} · Resolved threads: ${threads.filter((thread) => thread.status === 'resolved').length}`,
    '',
  ];
  for (const status of ['open', 'resolved'] as const) {
    lines.push(`## ${status === 'open' ? 'Open' : 'Resolved'}`, '');
    const statusThreads = ordered.filter((thread) => thread.status === status);
    if (statusThreads.length === 0) {
      lines.push('_None._', '');
      continue;
    }
    for (const [route, routeThreads] of byRoute) {
      const selected = routeThreads.filter((thread) => thread.status === status);
      if (selected.length === 0) continue;
      lines.push(`### Screen ${inlineCode(route)}`, '');
      for (const thread of selected) {
        lines.push(`#### ${thread.status === 'open' ? 'Open' : 'Resolved'} thread`, '');
        lines.push(...commentSection(thread.root, thread.status), '');
        for (const reply of thread.replies) {
          lines.push(...commentSection(reply, 'Reply'), '');
        }
      }
    }
  }
  if (orphans.length > 0) {
    lines.push('## Replies with missing root threads', '');
    for (const orphan of orphans) lines.push(...commentSection(orphan, 'Orphaned reply'), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
