import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import {
  ARTIFACT_MANIFEST,
  ARTIFACT_PACK_FORMAT,
  ARTIFACT_PACK_FORMAT_VERSION,
} from './artifact-pack.ts';
import { artifactDir } from './build.ts';
import { listFiles, sha256File } from './checksum.ts';
import { CliError } from './output.ts';
import { toPosixRelative } from './paths.ts';
import {
  appendJsonlEntry,
  assertNoSecretLikeKeys,
  buildDigest,
  gitState,
} from './publish-ledger.ts';
import type { CommandContext } from './workspace.ts';
import { resolveTarget } from './workspace.ts';

export const SHARE_LEDGER_FORMAT = 'protoyard.share-ledger';
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]+$/;
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const ShareLedgerEntrySchema = z
  .object({
    format: z.literal(SHARE_LEDGER_FORMAT),
    formatVersion: z.literal(1),
    at: z.iso.datetime({ offset: true }),
    slug: z.string().min(1),
    kind: z.literal('artifact'),
    url: z.string().regex(ARTIFACT_URL),
    visibility: z.literal('private'),
    buildSha256: Sha256,
    fileCount: z.number().int().nonnegative(),
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable(),
    dirty: z.boolean().nullable(),
    capabilities: z.array(z.string().min(1)),
  })
  .strict();

export type ShareLedgerEntry = z.infer<typeof ShareLedgerEntrySchema>;

export function shareLedgerPath(ctx: CommandContext): string {
  return join(ctx.paths.artifacts, 'share', 'ledger.jsonl');
}

export function parseShareLedgerEntry(value: unknown): ShareLedgerEntry {
  assertNoSecretLikeKeys(value);
  return ShareLedgerEntrySchema.parse(value);
}

export interface ShareLedgerRead {
  entries: ShareLedgerEntry[];
  skipped: number;
}

/** Reads valid entries in append order, ignoring malformed hand-edited lines. */
export async function readShareLedger(path: string): Promise<ShareLedgerRead> {
  if (!existsSync(path)) return { entries: [], skipped: 0 };
  const entries: ShareLedgerEntry[] = [];
  let skipped = 0;
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(parseShareLedgerEntry(JSON.parse(line)));
    } catch {
      skipped++;
    }
  }
  return { entries, skipped };
}

/** Returns the last recorded share for each slug, preserving first-seen order. */
export function latestShareEntries(entries: readonly ShareLedgerEntry[]): ShareLedgerEntry[] {
  const latest = new Map<string, ShareLedgerEntry>();
  for (const entry of entries) latest.set(entry.slug, entry);
  return [...latest.values()];
}

const PackFileSchema = z
  .object({
    path: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    sha256: Sha256,
  })
  .passthrough();

const SharePackManifestSchema = z
  .object({
    format: z.literal(ARTIFACT_PACK_FORMAT),
    formatVersion: z.literal(ARTIFACT_PACK_FORMAT_VERSION),
    slug: z.string().min(1),
    files: z.array(PackFileSchema),
    buildSha256: Sha256,
    capabilities: z.record(z.string(), z.unknown()).nullable(),
  })
  .passthrough();

function safePackPath(path: string): boolean {
  return (
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

async function readCurrentPack(ctx: CommandContext, slug: string) {
  const target = await resolveTarget(ctx, slug, 'prototype');
  const outDir = join(artifactDir(ctx, target.entry), 'artifact');
  const manifestPath = join(outDir, ARTIFACT_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new CliError('validation', `No Claude artifact pack manifest exists for ${slug}.`, {
      hint: `Run \`pnpm protoyard export ${slug} --target artifact\` first.`,
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new CliError('validation', `The artifact pack manifest for ${slug} is unreadable.`);
  }
  const parsed = SharePackManifestSchema.safeParse(raw);
  if (!parsed.success || parsed.data.slug !== slug) {
    throw new CliError('validation', `The artifact pack manifest for ${slug} is invalid.`);
  }
  const manifest = parsed.data;
  const paths = manifest.files.map((file) => file.path);
  if (paths.some((path) => !safePackPath(path)) || new Set(paths).size !== paths.length) {
    throw new CliError(
      'validation',
      `The artifact pack manifest for ${slug} has unsafe file paths.`
    );
  }
  if (buildDigest(manifest.files) !== manifest.buildSha256) {
    throw new CliError(
      'validation',
      `The artifact pack manifest for ${slug} has an inconsistent build sha256.`
    );
  }

  let actualFiles: string[];
  try {
    actualFiles = (await listFiles(outDir))
      .map((file) => relative(outDir, file).split(sep).join('/'))
      .filter((path) => path !== 'page.html' && path !== ARTIFACT_MANIFEST);
  } catch {
    throw new CliError('validation', `The packed artifact folder for ${slug} is unreadable.`);
  }
  const expectedFiles = [...paths].sort((a, b) => a.localeCompare(b));
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((path, i) => path !== expectedFiles[i])
  ) {
    throw new CliError(
      'validation',
      `The packed artifact folder for ${slug} no longer matches its manifest.`
    );
  }
  for (const file of manifest.files) {
    const path = join(outDir, ...file.path.split('/'));
    try {
      const [sha256, { size }] = await Promise.all([sha256File(path), stat(path)]);
      if (sha256 !== file.sha256 || size !== file.bytes) {
        throw new CliError(
          'validation',
          `Packed file ${file.path} no longer matches the artifact manifest.`
        );
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError('validation', `Packed file ${file.path} is missing or unreadable.`);
    }
  }
  return manifest;
}

/** Records only a strict Claude Artifact URL after verifying its local pack. */
export async function recordArtifactShare(
  ctx: CommandContext,
  slug: string,
  url: string
): Promise<ShareLedgerEntry> {
  if (!ARTIFACT_URL.test(url)) {
    throw new CliError('validation', 'The URL is not a Claude artifact URL.', {
      hint: 'Expected https://claude.ai/artifact/<id> or https://claude.ai/code/artifact/<id>.',
    });
  }
  const manifest = await readCurrentPack(ctx, slug);
  const state = await gitState(ctx.root);
  const entry = parseShareLedgerEntry({
    format: SHARE_LEDGER_FORMAT,
    formatVersion: 1,
    at: new Date().toISOString(),
    slug,
    kind: 'artifact',
    url,
    visibility: 'private',
    buildSha256: manifest.buildSha256,
    fileCount: manifest.files.length,
    commit: state.commit,
    dirty: state.dirty,
    capabilities: Object.keys(manifest.capabilities ?? {}).sort(),
  });
  await appendJsonlEntry(shareLedgerPath(ctx), entry);
  return entry;
}

export function shareLedgerRelativePath(ctx: CommandContext): string {
  return toPosixRelative(ctx.root, shareLedgerPath(ctx));
}
