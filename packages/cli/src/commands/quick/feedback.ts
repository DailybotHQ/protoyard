import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ReviewComment } from '@protoyard/core/review';
import {
  createReviewCommentsFile,
  type ReviewCommentsFile,
  renderReviewMarkdown,
  toReviewCommentsFile,
  UNTRUSTED_NOTICE,
} from '@protoyard/review/report';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { opt } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { toPosixRelative } from '../../lib/paths.ts';
import { writeQuickAtomic } from '../../lib/quick/atomic-write.ts';
import { createFileCommentsStore } from '../../lib/quick/comments-store.ts';
import { historyEntryName } from '../../lib/quick/history.ts';
import { readQuickRecord } from '../../lib/quick/model.ts';
import { explorationNamespaces } from './namespaces.ts';
import { resolveExploration } from './promote.ts';
import { markdownCell } from './report.ts';

/**
 * `protoyard quick feedback <slug|dir> [--import <file>]`: the review comments
 * of an exploration as `REVIEW.md` (with `renderReviewMarkdown`) and a JSON
 * copy, `REVIEW.json`, next to its blueprint.
 *
 * Comments come from the exploration's own store (`review/comments.json`,
 * written by `quick serve`'s comments API) and, with `--import`, from a
 * `protoyard-review-comments` v1 file a reviewer exported from the browser
 * (the local adapter), or a pulled copy of one. The file is untrusted: size-
 * capped, schema-checked, and it must belong to this exploration, one of
 * its variants, or an earlier base blueprint kept in its `quick iterate`
 * history (the player's content namespace; a tab that live-reloaded after an
 * iterate keeps commenting under the blueprint it first opened), or it is
 * refused before anything is written. Comments on an earlier blueprint get
 * their own section, marked as an earlier version. Imported comments merge into the store by id, the
 * newer edit winning, so later runs and the served UI keep them. Comment text
 * is rendered as untrusted data: one safe line at a time, Markdown escaped.
 */

export const QUICK_FEEDBACK_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
const FEEDBACK_FORMAT = 'protoyard.quick-feedback';

interface Group {
  variant: string | null;
  label: string;
  namespace: string;
  /** The history entry of an earlier base blueprint, or null. */
  earlier: number | null;
}

const stamp = (comment: ReviewComment) => Date.parse(comment.updatedAt ?? comment.createdAt);

async function readImport(file: string): Promise<unknown> {
  const path = resolve(process.cwd(), file);
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile()) {
    throw new CliError('not_found', `Comments file not found: ${file}`, {
      hint: 'Pass the JSON file the review panel exported (symlinks and folders are refused).',
    });
  }
  if (info.size > QUICK_FEEDBACK_IMPORT_MAX_BYTES) {
    throw new CliError(
      'validation',
      `${file} is ${info.size} bytes; the limit is ${QUICK_FEEDBACK_IMPORT_MAX_BYTES}.`
    );
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new CliError('validation', `${file} is not valid JSON.`);
  }
}

/** One report for the exploration: a section per blueprint that has comments. */
function renderFeedbackMarkdown(input: {
  name: string;
  pulledAt: string;
  sections: { group: Group; comments: readonly ReviewComment[] }[];
}): string {
  const lines = [
    `# Exploration feedback: ${markdownCell(input.name)}`,
    '',
    'Scope: this export covers the current blueprint, its recorded variants, and the earlier base blueprints kept in its `quick iterate` history (a tab that live-reloaded after an iterate keeps commenting under the blueprint it first opened). Sections for an earlier blueprint are marked as an earlier version and name the history entry.',
    '',
    UNTRUSTED_NOTICE,
    '',
  ];
  const withComments = input.sections.filter((section) => section.comments.length > 0);
  if (withComments.length === 0) lines.push('_No comments yet._', '');
  for (const { group, comments } of withComments) {
    lines.push(`## ${markdownCell(group.label)}`, '');
    // The shared renderer's headings move one level down under this section.
    const report = renderReviewMarkdown({
      slug: group.namespace,
      comments,
      pulledAt: input.pulledAt,
    });
    for (const line of report.trimEnd().split('\n')) {
      lines.push(/^#{1,5} /.test(line) ? `#${line}` : line);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export const quickFeedbackCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const dir = resolveExploration(ctx.root, args[0] ?? '');
  const record = await readQuickRecord(dir);
  const resolved = await explorationNamespaces(dir, record);
  const [base] = resolved.groups;
  if (!base) throw new CliError('failure', 'The exploration has no base blueprint.');
  const current: Group[] = resolved.groups.map((group) => ({
    variant: group.variant,
    label: group.label,
    namespace: group.namespace,
    earlier: null,
  }));
  // Earlier base blueprints, oldest change first, right after the base section.
  const earlier: Group[] = [...resolved.earlier]
    .sort((a, b) => a.sequence - b.sequence)
    .map((entry) => ({
      variant: null,
      label: `Base, earlier version (before change ${entry.sequence}, ${historyEntryName(entry.sequence)}): ${entry.blueprint.name}`,
      namespace: entry.namespace,
      earlier: entry.sequence,
    }));
  const groups: Group[] = [current[0] as Group, ...earlier, ...current.slice(1)];
  const namespaces = groups.map((group) => group.namespace);

  // Validate the import completely before touching the store.
  const importArg = opt(options, 'import');
  let imported: ReviewCommentsFile | null = null;
  if (importArg !== undefined) {
    const value = await readImport(importArg);
    try {
      imported = toReviewCommentsFile(value);
    } catch (error) {
      throw new CliError(
        'validation',
        `${importArg} is not a protoyard-review-comments v1 file: ${(error as Error).message.split('\n')[0]}`,
        { hint: 'Use the file the review panel exported, unchanged.' }
      );
    }
    if (!namespaces.includes(imported.slug) || imported.namespace !== imported.slug) {
      throw new CliError(
        'validation',
        `${importArg} holds comments for "${imported.slug}", not this exploration, its variants or its earlier versions.`,
        { hint: `This exploration's namespaces: ${resolved.hint}.` }
      );
    }
  }

  let store: ReturnType<typeof createFileCommentsStore>;
  const merged = { added: 0, updated: 0, unchanged: 0 };
  try {
    store = createFileCommentsStore(dir, namespaces);
    if (imported) {
      let additions = 0;
      for (const comment of imported.comments) {
        if (!(await store.get(comment.slug, comment.id))) additions += 1;
      }
      const total = await store.countAll();
      if (total + additions > 2_000) {
        throw new CliError(
          'validation',
          `Import would exceed the 2,000-comment limit (${total} stored, ${additions} new).`
        );
      }
      for (const comment of imported.comments) {
        const existing = await store.get(comment.slug, comment.id);
        if (!existing) {
          await store.put(comment);
          merged.added += 1;
        } else if (stamp(comment) > stamp(existing)) {
          await store.put(comment);
          merged.updated += 1;
        } else {
          merged.unchanged += 1;
        }
      }
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('validation', (error as Error).message, {
      hint: 'The served comments store (review/comments.json) could not be read or updated.',
    });
  }

  const pulledAt = new Date().toISOString();
  const sections: { group: Group; comments: ReviewComment[] }[] = [];
  for (const group of groups) {
    const comments = await store.list(group.namespace);
    // An earlier version without comments adds nothing to the export.
    if (group.earlier !== null && comments.length === 0) continue;
    sections.push({ group, comments });
  }
  const markdownPath = join(dir, 'REVIEW.md');
  const jsonPath = join(dir, 'REVIEW.json');
  await writeQuickAtomic(
    markdownPath,
    renderFeedbackMarkdown({ name: base.blueprint.name, pulledAt, sections })
  );
  await writeQuickAtomic(
    jsonPath,
    `${JSON.stringify(
      {
        format: FEEDBACK_FORMAT,
        formatVersion: 1,
        slug: record.slug,
        pulledAt,
        files: sections.map(({ group, comments }) => ({
          variant: group.variant,
          earlier: group.earlier,
          file: createReviewCommentsFile({
            namespace: group.namespace,
            slug: group.namespace,
            comments,
          }),
        })),
      },
      null,
      2
    )}\n`
  );

  const data = {
    slug: record.slug,
    dir: toPosixRelative(ctx.root, dir),
    report: toPosixRelative(ctx.root, markdownPath),
    data: toPosixRelative(ctx.root, jsonPath),
    pulledAt,
    imported: imported ? { file: importArg, comments: imported.comments.length, ...merged } : null,
    groups: sections.map(({ group, comments }) => ({
      variant: group.variant,
      earlier: group.earlier,
      namespace: group.namespace,
      comments: comments.length,
      threads: comments.filter((comment) => comment.id === comment.threadId).length,
    })),
  };
  return {
    data,
    render(out) {
      const { c } = out;
      if (data.imported) {
        out.info(
          `${mark(c, 'pass')} Imported ${data.imported.comments} comments: ${merged.added} new, ${merged.updated} updated, ${merged.unchanged} unchanged`
        );
      }
      const total = data.groups.reduce((n, group) => n + group.comments, 0);
      out.always(`${mark(c, 'pass')} ${c.cyan(data.report)}: ${total} comments (${data.data})`);
    },
  };
};
