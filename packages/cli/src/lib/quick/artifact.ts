import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  ARTIFACT_LIMITS,
  ARTIFACT_MANIFEST,
  ARTIFACT_PAGE,
  ARTIFACT_PAGE_STYLE,
  checkTextAsset,
  escapeReplacementCharacters,
  firstSentence,
  iconForBlueprint,
  type PackIssue,
} from '../artifact-pack.ts';
import { sha256Text } from '../checksum.ts';
import { CliError } from '../output.ts';
import { type QuickShare, readQuickRecord, writeQuickRecord } from './model.ts';

/**
 * An exploration packed for the Claude Artifact tool (`protoyard quick export
 * <slug|dir> --target artifact`): the single-file export (single-file.ts)
 * turned into Artifact page content, plus the exact publish arguments.
 *
 * - `<dir>/artifact/page.html` is BODY CONTENT: the Artifact tool wraps the
 *   page in its own document skeleton, so the single file's doctype, `<html>`,
 *   `<head>` and `<body>` wrappers are dropped. The charset and viewport metas
 *   come from that skeleton, and the single file's CSP meta is dropped too: a
 *   CSP meta outside `<head>` is ignored, so the host's own policy applies.
 * - It is ONE file: the player's chunks are already inline, so the publish has
 *   no `files` and stays far under every ARTIFACT_LIMITS cap.
 * - `<dir>/artifact/artifact-manifest.json` records the page's size and
 *   sha256 and the publish arguments (title of at most four words, icon,
 *   description).
 *
 * The CLI never publishes: only an agent with the Artifact tool can, after the
 * developer approves. The returned URL is then recorded in the exploration's
 * own quick.json (`shares`), never in the prototype share ledger, which is
 * keyed by registry slugs.
 */

export const QUICK_ARTIFACT_FORMAT = 'protoyard.quick-artifact' as const;
export const QUICK_ARTIFACT_FORMAT_VERSION = 1 as const;
/** The pack folder inside the exploration. */
export const QUICK_ARTIFACT_DIR = 'artifact';
/** The Artifact tool's cap on a gallery-card description. */
export const ARTIFACT_DESCRIPTION_MAX_CHARS = 1000;
/** Used when the blueprint name has no word characters. */
const FALLBACK_TITLE = 'Protoyard exploration';

export interface QuickArtifactInput {
  /** The single-file export's full HTML document. */
  singleFileHtml: string;
  slug: string;
  /** `kind` picks the icon of a deck, page or doc; an app's comes from its category. */
  blueprint: { name: string; description?: string; category?: string; kind?: string };
  blueprintSha256: string;
  playerVersion: string;
}

export interface QuickArtifactPublish {
  title: string;
  icon: string;
  description: string;
}

export interface QuickArtifactManifest {
  format: typeof QUICK_ARTIFACT_FORMAT;
  formatVersion: typeof QUICK_ARTIFACT_FORMAT_VERSION;
  slug: string;
  blueprintSha256: string;
  playerVersion: string;
  page: { path: typeof ARTIFACT_PAGE; bytes: number; sha256: string };
  publish: QuickArtifactPublish;
}

export interface QuickArtifactPack {
  page: string;
  manifest: QuickArtifactManifest;
  issues: PackIssue[];
}

/** A short name for the artifact: the blueprint name, cut to at most four words. */
export function quickArtifactTitle(name: string): string {
  const words = name
    .replace(/[<>]/g, ' ')
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
  return words.length > 0 ? words.slice(0, ARTIFACT_LIMITS.titleWords).join(' ') : FALLBACK_TITLE;
}

/** One sentence for the gallery card, labeled as a simulation when the blueprint has none. */
export function quickArtifactDescription(blueprint: QuickArtifactInput['blueprint']): string {
  const own = firstSentence(blueprint.description ?? '');
  const text = own || `${blueprint.name}: a playable Protoyard exploration with simulated data.`;
  return text.slice(0, ARTIFACT_DESCRIPTION_MAX_CHARS);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The single file as Artifact page content: `<title>` first, the page
 * contract's color tokens, then the head's metadata, inline scripts and styles
 * in order, then the body. Script types (`application/json`, `text/plain`
 * chunks) are kept as written, so inert data stays inert.
 */
export function singleFileToArtifactPage(html: string, title: string): string {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  const headContent = head
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, (tag) =>
      /\b(?:charset|http-equiv)\s*=|\bname\s*=\s*["']?viewport/i.test(tag) ? '' : tag
    )
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<style>${ARTIFACT_PAGE_STYLE}</style>`,
    headContent,
    body.trim(),
    '',
  ].join('\n');
}

/**
 * The Artifact tool refuses text with U+FFFD. Bundled libraries can hold it
 * on purpose (the real player does), so inside script and style bodies it
 * becomes the escape that means the same character, as the prototype pack
 * does for JS, JSON and CSS files. Anywhere else it stays, and is refused.
 */
export function escapeInlineReplacementCharacters(page: string): string {
  if (!page.includes('\uFFFD')) return page;
  return page
    .replace(
      /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (_match, open: string, body: string, close: string) =>
        `${open}${escapeReplacementCharacters('inline.js', body) ?? body}${close}`
    )
    .replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (_match, open: string, body: string, close: string) =>
        `${open}${escapeReplacementCharacters('inline.css', body) ?? body}${close}`
    );
}

/** Pure: the page, its manifest, and every Artifact rule it breaks. */
export function buildQuickArtifact(input: QuickArtifactInput): QuickArtifactPack {
  const issues: PackIssue[] = [];
  const title = quickArtifactTitle(input.blueprint.name);
  const page = escapeInlineReplacementCharacters(
    singleFileToArtifactPage(input.singleFileHtml, title)
  );
  const bytes = Buffer.byteLength(page, 'utf8');

  if (!/<body\b/i.test(input.singleFileHtml) || !/<head\b/i.test(input.singleFileHtml)) {
    issues.push({ path: ARTIFACT_PAGE, reason: 'the single file has no <head> and <body>' });
  }
  if (bytes > ARTIFACT_LIMITS.textFileBytes) {
    issues.push({
      path: ARTIFACT_PAGE,
      reason: `${bytes} bytes is over the ${ARTIFACT_LIMITS.textFileBytes}-byte text file limit`,
    });
  }
  if (bytes > ARTIFACT_LIMITS.bytesPerPublish) {
    issues.push({
      path: ARTIFACT_PAGE,
      reason: `${bytes} bytes is over the ${ARTIFACT_LIMITS.bytesPerPublish}-byte publish limit`,
    });
  }
  if (page.includes('�')) {
    issues.push({
      path: ARTIFACT_PAGE,
      reason: 'contains U+FFFD, which the Artifact tool refuses as a broken decode',
    });
  }
  // Network imports anywhere, inert chunk text included.
  issues.push(...checkTextAsset(ARTIFACT_PAGE, page));
  // Network references in the markup itself (inert script bodies are data, not markup).
  const markup = page.replace(
    /(<script\b[^>]*\btype=["']?(?:text\/plain|application\/json)[^>]*>)[\s\S]*?<\/script>/gi,
    '$1</script>'
  );
  for (const match of markup.matchAll(
    /<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//gi
  )) {
    issues.push({
      path: ARTIFACT_PAGE,
      reason: `references a network resource (${match[0].slice(0, 80)}); the page must be self-contained`,
    });
  }

  return {
    page,
    issues,
    manifest: {
      format: QUICK_ARTIFACT_FORMAT,
      formatVersion: QUICK_ARTIFACT_FORMAT_VERSION,
      slug: input.slug,
      blueprintSha256: input.blueprintSha256,
      playerVersion: input.playerVersion,
      page: { path: ARTIFACT_PAGE, bytes, sha256: sha256Text(page) },
      publish: {
        title,
        icon: iconForBlueprint(input.blueprint),
        description: quickArtifactDescription(input.blueprint),
      },
    },
  };
}

/** The Artifact tool's publish arguments for the pack: one page, no supporting files. */
export function quickArtifactPublishArguments(
  manifest: QuickArtifactManifest,
  packDir: string
): { file_path: string; title: string; icon: string; description: string } {
  return {
    file_path: join(resolve(packDir), manifest.page.path),
    title: manifest.publish.title,
    icon: manifest.publish.icon,
    description: manifest.publish.description,
  };
}

/** Writes `<dir>/artifact/` (replacing an earlier pack). Throws `validation` on any issue. */
export async function writeQuickArtifact(
  dir: string,
  pack: QuickArtifactPack
): Promise<{ packDir: string }> {
  if (pack.issues.length > 0) {
    throw new CliError('validation', 'The exploration does not fit the Artifact rules.', {
      hint: pack.issues
        .slice(0, 3)
        .map((issue) => `${issue.path}: ${issue.reason}`)
        .join('; '),
    });
  }
  const packDir = join(dir, QUICK_ARTIFACT_DIR);
  const staging = `${packDir}.${randomUUID()}.tmp`;
  await mkdir(staging);
  try {
    await writeFile(join(staging, ARTIFACT_PAGE), pack.page, { encoding: 'utf8', flag: 'wx' });
    await writeFile(
      join(staging, ARTIFACT_MANIFEST),
      `${JSON.stringify(pack.manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' }
    );
    await rm(packDir, { recursive: true, force: true });
    await rename(staging, packDir);
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
  return { packDir };
}

const ManifestSchema = z
  .object({
    format: z.literal(QUICK_ARTIFACT_FORMAT),
    formatVersion: z.literal(QUICK_ARTIFACT_FORMAT_VERSION),
    slug: z.string().min(1).max(64),
    blueprintSha256: z.string().regex(/^[0-9a-f]{64}$/),
    playerVersion: z.string().min(1).max(64),
    page: z
      .object({
        path: z.literal(ARTIFACT_PAGE),
        bytes: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    publish: z
      .object({
        title: z.string().min(1).max(200),
        icon: z.string().min(1).max(40),
        description: z.string().min(1).max(ARTIFACT_DESCRIPTION_MAX_CHARS),
      })
      .strict(),
  })
  .strict();

/** Reads a pack back as untrusted input and checks the page still matches its manifest. */
export async function readQuickArtifact(dir: string): Promise<QuickArtifactManifest> {
  const packDir = join(dir, QUICK_ARTIFACT_DIR);
  const manifestPath = join(packDir, ARTIFACT_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new CliError('not_found', 'The exploration has no artifact pack.', {
      hint: 'Run `protoyard quick export <slug> --target artifact` first.',
    });
  }
  const info = await lstat(manifestPath);
  if (!info.isFile() || info.size > 64 * 1024) {
    throw new CliError('validation', `${ARTIFACT_MANIFEST} is not a small regular file.`);
  }
  let parsed: z.infer<typeof ManifestSchema>;
  try {
    parsed = ManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  } catch {
    throw new CliError(
      'validation',
      `${ARTIFACT_MANIFEST} is not a valid quick artifact manifest.`
    );
  }
  const page = await readFile(join(packDir, ARTIFACT_PAGE), 'utf8').catch(() => null);
  if (page === null || sha256Text(page) !== parsed.page.sha256) {
    throw new CliError('validation', `${ARTIFACT_PAGE} no longer matches the artifact manifest.`, {
      hint: 'Pack it again with `protoyard quick export <slug> --target artifact`, then publish that page.',
    });
  }
  return parsed;
}

/** Same shapes the prototype share ledger accepts. */
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]+$/;

/**
 * Records the URL the Artifact tool returned for this pack in the
 * exploration's quick.json: private at record time, with the page's sha256.
 * The URL's shape is checked; that the Artifact tool returned it is the
 * caller's (the skill's) job.
 */
export async function recordQuickArtifactShare(
  dir: string,
  url: string,
  now: () => Date = () => new Date()
): Promise<{ share: QuickShare; shares: number }> {
  if (!ARTIFACT_URL.test(url)) {
    throw new CliError(
      'usage',
      'The URL is not a Claude artifact link (https://claude.ai/artifact/<id> or https://claude.ai/code/artifact/<id>).'
    );
  }
  const manifest = await readQuickArtifact(dir);
  const record = await readQuickRecord(dir);
  if (manifest.slug !== record.slug || manifest.blueprintSha256 !== record.blueprintSha256) {
    throw new CliError('validation', 'The artifact pack was made from another blueprint.', {
      hint: 'Pack it again with `protoyard quick export <slug> --target artifact`.',
    });
  }
  const at = now().toISOString();
  const share: QuickShare = {
    kind: 'artifact',
    url,
    visibility: 'private',
    variant: null,
    sha256: manifest.page.sha256,
    at,
  };
  const written = await writeQuickRecord(dir, {
    ...record,
    updatedAt: at,
    shares: [...record.shares, share],
  });
  return { share, shares: written.shares.length };
}
