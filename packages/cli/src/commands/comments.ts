import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createPulledReviewComments,
  type PulledReviewComments,
  renderReviewMarkdown,
  toReviewCommentsFile,
} from '@protoyard/review/report';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { isInside, toPosixRelative } from '../lib/paths.ts';
import { assertSlug, resolveTarget } from '../lib/workspace.ts';

const MAX_REVIEW_FILE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

async function readJsonFile(path: string): Promise<unknown> {
  let content: string;
  try {
    const bytes = await readFile(path);
    if (bytes.byteLength > MAX_REVIEW_FILE_BYTES) {
      throw new CliError('validation', 'Review comments file exceeds the 5 MB limit.');
    }
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error instanceof Error && error.name === 'TypeError') {
      throw new CliError('validation', 'Review comments file is not valid UTF-8.');
    }
    throw new CliError('not_found', `Cannot read review comments file ${path}.`);
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new CliError('validation', 'Review comments file is not valid JSON.');
  }
}

async function readResponseJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_REVIEW_FILE_BYTES) {
    throw new CliError('validation', 'Remote comments response exceeds the 5 MB limit.');
  }
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REVIEW_FILE_BYTES) {
        await reader.cancel();
        throw new CliError('validation', 'Remote comments response exceeds the 5 MB limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new CliError('validation', 'Remote comments response is not valid JSON.');
  }
}

function remoteCollectionUrl(raw: string, slug: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError('usage', '--from must be an absolute HTTP(S) comments endpoint URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new CliError('usage', '--from must be an HTTP(S) URL without embedded credentials.');
  }
  if (url.search || url.hash) {
    throw new CliError('usage', '--from must not contain a query string or fragment.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`;
  return url;
}

async function fetchComments(url: URL): Promise<unknown[]> {
  const headers = new Headers({ Accept: 'application/json' });
  const key = process.env.PROTOYARD_REVIEW_KEY;
  if (key) headers.set('x-review-key', key);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new CliError('failure', 'Remote comments request timed out after 10 seconds.');
    }
    throw new CliError(
      'failure',
      'Remote comments request failed. Check the endpoint and network.'
    );
  }
  if (!response.ok) {
    throw new CliError(
      response.status === 401 || response.status === 403 ? 'auth' : 'failure',
      `Remote comments endpoint returned HTTP ${response.status}.`
    );
  }
  const body = await readResponseJson(response);
  if (typeof body !== 'object' || body === null || !('comments' in body)) {
    throw new CliError('validation', 'Remote comments response is missing its comments list.');
  }
  if (!Array.isArray(body.comments)) {
    throw new CliError('validation', 'Remote comments response has an invalid comments list.');
  }
  return body.comments;
}

function commentsPath(ctx: Parameters<Handler>[0], slug: string): string {
  return resolve(ctx.paths.artifacts, 'review', 'comments', `${slug}.json`);
}

function safeOutputPath(
  ctx: Parameters<Handler>[0],
  raw: string | undefined,
  fallback: string
): string {
  const path = resolve(ctx.root, raw ?? fallback);
  if (!isInside(ctx.root, path)) {
    throw new CliError('unsafe_path', 'Review report output must stay inside the workspace.');
  }
  return path;
}

async function writeOutput(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

function parseFileComments(value: unknown, slug: string, namespace: string) {
  try {
    return toReviewCommentsFile(value, { slug, namespace });
  } catch (error) {
    throw new CliError(
      'validation',
      error instanceof Error ? error.message : 'Review comments file failed validation.'
    );
  }
}

export const commentsPullCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  if (args.length !== 1) throw new CliError('usage', 'Pass exactly one prototype slug.');
  const slug = assertSlug(args[0]);
  const from = opt(options, 'from');
  const file = opt(options, 'file');
  if (Boolean(from) === Boolean(file)) {
    throw new CliError('usage', 'Pass exactly one source: --from <url> or --file <json>.');
  }
  const format = opt(options, 'format');
  if (format !== 'md' && format !== 'json') {
    throw new CliError('usage', 'Pass --format md or --format json.');
  }
  const { entry, dir } = await resolveTarget(ctx, slug, 'prototype');
  const pulledAt = new Date().toISOString();
  let comments: unknown[];
  if (from) {
    comments = await fetchComments(remoteCollectionUrl(from, slug));
  } else {
    const sourcePath = resolve(ctx.root, file as string);
    const source = parseFileComments(await readJsonFile(sourcePath), slug, entry.namespace);
    comments = source.comments;
  }

  let pulled: PulledReviewComments;
  try {
    pulled = createPulledReviewComments({
      namespace: entry.namespace,
      slug,
      comments,
      pulledAt,
    });
  } catch (error) {
    throw new CliError(
      'validation',
      error instanceof Error ? error.message : 'Comments failed review schema validation.'
    );
  }

  const markdown = renderReviewMarkdown({ slug, comments: pulled.comments, pulledAt });
  const markdownPath = safeOutputPath(ctx, resolve(dir, 'docs', 'REVIEW.md'), '');
  const dataPath = safeOutputPath(ctx, commentsPath(ctx, slug), '');
  const customOut = opt(options, 'out');
  const customPath = customOut ? safeOutputPath(ctx, customOut, '') : undefined;
  const selected = format === 'md' ? markdown : `${JSON.stringify(pulled, null, 2)}\n`;
  await writeOutput(markdownPath, markdown);
  await writeOutput(dataPath, `${JSON.stringify(pulled, null, 2)}\n`);
  if (customPath && customPath !== markdownPath && customPath !== dataPath) {
    await writeOutput(customPath, selected);
  }

  const result = {
    slug,
    source: from ? 'remote' : 'file',
    comments: pulled.comments.length,
    pulledAt,
    report: toPosixRelative(ctx.root, markdownPath),
    data: toPosixRelative(ctx.root, dataPath),
    ...(customPath ? { out: toPosixRelative(ctx.root, customPath), format } : {}),
  };
  return {
    data: result,
    render(out) {
      out.always(`Pulled ${pulled.comments.length} comments for ${slug}.`);
      out.always(`  report  ${toPosixRelative(ctx.root, markdownPath)}`);
      out.always(`  data    ${toPosixRelative(ctx.root, dataPath)}`);
      if (customPath) out.always(`  output  ${toPosixRelative(ctx.root, customPath)} (${format})`);
    },
  };
};

export const commentsImportCommand: Handler = async (ctx, args): Promise<CommandResult> => {
  if (args.length !== 2) throw new CliError('usage', 'Use `comments import <slug> <file>`.');
  const slug = assertSlug(args[0]);
  const { entry } = await resolveTarget(ctx, slug, 'prototype');
  const source = resolve(ctx.root, args[1] as string);
  const localFile = parseFileComments(await readJsonFile(source), slug, entry.namespace);
  const pulled = createPulledReviewComments({
    namespace: entry.namespace,
    slug,
    comments: localFile.comments,
  });
  const output = commentsPath(ctx, slug);
  await writeOutput(output, `${JSON.stringify(pulled, null, 2)}\n`);
  return {
    data: {
      slug,
      comments: pulled.comments.length,
      pulledAt: pulled.pulledAt,
      file: toPosixRelative(ctx.root, output),
    },
    render(out) {
      out.always(`Imported ${pulled.comments.length} comments for ${slug}.`);
      out.always(`  data  ${toPosixRelative(ctx.root, output)}`);
    },
  };
};

export const commentsExportCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  if (args.length !== 1) throw new CliError('usage', 'Pass exactly one prototype slug.');
  const slug = assertSlug(args[0]);
  const { entry } = await resolveTarget(ctx, slug, 'prototype');
  const inputPath = commentsPath(ctx, slug);
  const pulled = await readJsonFile(inputPath);
  const localFile = parseFileComments(pulled, slug, entry.namespace);
  const outputPath = safeOutputPath(
    ctx,
    opt(options, 'out'),
    `artifacts/review/exports/${slug}.json`
  );
  await writeOutput(outputPath, `${JSON.stringify(localFile, null, 2)}\n`);
  return {
    data: {
      slug,
      comments: localFile.comments.length,
      file: toPosixRelative(ctx.root, outputPath),
      format: 'protoyard-review-comments',
    },
    render(out) {
      out.always(`Exported ${localFile.comments.length} comments for ${slug}.`);
      out.always(`  file  ${toPosixRelative(ctx.root, outputPath)}`);
    },
  };
};
