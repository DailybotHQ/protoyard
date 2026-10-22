import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveReviewBuild } from '@protoyard/core';
import {
  ARTIFACT_AVATAR_SIZES,
  ARTIFACT_COMMENT_CAPABILITIES,
  ARTIFACT_PAGE,
  type ArtifactPackManifest,
  packArtifact,
  publishArguments,
} from '../lib/artifact-pack.ts';
import {
  artifactDir,
  BUILD_MANIFEST_FILENAME,
  type BuildManifest,
  buildPrototype,
  scanForForeignCode,
  verifyDist,
} from '../lib/build.ts';
import { digestDirectory } from '../lib/checksum.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, formatBytes, mark, toCliError } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { loadRegistry, type Registry, type RegistryEntry } from '../lib/registry.ts';
import { hasReviewWorker, REVIEW_WORKER_FILE } from '../lib/review-worker.ts';
import { type CommandContext, resolveTarget } from '../lib/workspace.ts';
import { zipDirectory } from '../lib/zip.ts';
import { buildOptionsFrom } from './build.ts';

/** Confirms an existing dist still matches its build manifest byte for byte. */
async function verifyExistingBuild(outDir: string, manifestPath: string) {
  if (!existsSync(outDir) || !existsSync(manifestPath)) {
    throw new CliError('not_found', 'No previous build to export.', {
      hint: 'Drop --skip-build, or run `pnpm protoyard build <slug>` first.',
    });
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BuildManifest;
  const current = await digestDirectory(outDir);
  const expected = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  const changed =
    current.length !== manifest.files.length ||
    current.some((f) => expected.get(f.path) !== f.sha256);
  if (changed) {
    throw new CliError('validation', 'dist/ no longer matches build-manifest.json.', {
      hint: 'Rebuild without --skip-build so the archive and its manifest agree.',
    });
  }
  return manifest;
}

export interface ExportOneResult {
  slug: string;
  zip: string;
  size: number;
  sha256: string;
  files: number;
  base: string;
  includeDevtools: boolean;
  buildManifest: string;
  isolation: { checkedAgainst: number; foreign: unknown[] };
}

/** Build (unless skipped) + isolate + zip one prototype. Shared by single and --all. */
export async function exportOne(
  ctx: CommandContext,
  entry: RegistryEntry,
  dir: string,
  registry: Registry,
  options: Record<string, unknown>
): Promise<ExportOneResult> {
  const artifacts = artifactDir(ctx, entry);
  const outDir = join(artifacts, 'dist');
  const manifestPath = join(artifacts, BUILD_MANIFEST_FILENAME);

  let manifest: BuildManifest;
  if (flag(options, 'skipBuild')) {
    manifest = await verifyExistingBuild(outDir, manifestPath);
    const problems = await verifyDist(outDir, manifest.base);
    if (problems.length > 0) throw new CliError('validation', problems.join(' '));
  } else {
    const { out: _ignored, ...buildOptions } = buildOptionsFrom(options);
    ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)}…`);
    manifest = (await buildPrototype(ctx, entry, dir, buildOptions)).manifest;
  }

  const foreign = await scanForForeignCode(outDir, entry, registry.entries);
  if (foreign.length > 0) {
    throw new CliError(
      'validation',
      `The ${entry.slug} bundle contains code from other prototypes.`,
      {
        hint: foreign.map((f) => `${f.file} references ${f.slug} (${f.id})`).join('; '),
        data: { foreign },
      }
    );
  }

  // The comments worker belongs to a Cloudflare deploy (`publish --comments`), never a ZIP.
  if (hasReviewWorker(outDir)) {
    throw new CliError(
      'validation',
      `${REVIEW_WORKER_FILE} is in the build; ZIP exports never ship it.`,
      {
        hint: 'Rebuild without --skip-build (a plain build has no worker).',
      }
    );
  }
  const zipPath = join(artifacts, `${entry.slug}.zip`);
  const zip = await zipDirectory(outDir, zipPath);
  return {
    slug: entry.slug,
    zip: toPosixRelative(ctx.root, zip.path),
    size: zip.size,
    sha256: zip.sha256,
    files: zip.files,
    base: manifest.base,
    includeDevtools: manifest.includeDevtools,
    buildManifest: toPosixRelative(ctx.root, manifestPath),
    isolation: { checkedAgainst: registry.entries.length - 1, foreign: [] },
  };
}

/** Where the artifact target builds, apart from the plain build in dist/. */
const ARTIFACT_BUILD_DIR = 'artifact-dist';
const ARTIFACT_BUILD_MANIFEST = 'artifact-build.json';
const ARTIFACT_OUT_DIR = 'artifact';

export interface ArtifactExportResult {
  slug: string;
  target: 'artifact';
  dryRun: boolean;
  /** The pack folder (written unless --dry-run). */
  outDir: string;
  page: string;
  files: number;
  totalBytes: number;
  batches: number;
  buildSha256: string;
  includeDevtools: boolean;
  frameWhenEmbedded: true;
  warnings: string[];
  capabilities: Record<string, unknown> | null;
  isolation: { checkedAgainst: number; foreign: unknown[] };
  manifest: ArtifactPackManifest;
  /** The exact Artifact tool arguments, one entry per publish batch (batch 1 creates the page). */
  publish: ReturnType<typeof publishArguments>[];
}

/**
 * `export <slug> --target artifact`: builds a share-ready copy (DevTools
 * included unless --no-devtools, frames kept inside the Claude artifact
 * viewer), checks isolation and packs it into artifacts/<slug>/artifact/ with
 * artifact-pack.ts. Every broken Artifact rule fails with exit 4 and its
 * reasons; --dry-run reports without writing the pack.
 */
export async function exportArtifact(
  ctx: CommandContext,
  entry: RegistryEntry,
  dir: string,
  registry: Registry,
  options: Record<string, unknown>
): Promise<ArtifactExportResult> {
  const raw = JSON.parse(await readFile(join(dir, 'protoyard.json'), 'utf8')) as {
    build?: { offline?: boolean; review?: Parameters<typeof resolveReviewBuild>[0] };
  };
  if (flag(options, 'offline') || raw.build?.offline === true) {
    throw new CliError(
      'validation',
      `${entry.slug} cannot be shared as a Claude artifact with offline support.`,
      {
        hint: 'A service worker does not belong in an artifact: drop --offline, or set "build": { "offline": false } for this export.',
      }
    );
  }
  const base = opt(options, 'base');
  if (base !== undefined && base !== './') {
    throw new CliError(
      'usage',
      'An artifact is always built with the relative base ./ (drop --base).'
    );
  }
  const comments = flag(options, 'comments');
  if (comments && !resolveReviewBuild(raw.build?.review).enabled) {
    throw new CliError(
      'validation',
      `--comments needs review comments enabled for ${entry.slug}.`,
      {
        hint: 'Set "build": { "review": { "enabled": true } } in its protoyard.json (docs/REVIEW_COMMENTS.md).',
      }
    );
  }
  const includeDevtools = options.devtools !== false;
  const artifacts = artifactDir(ctx, entry);
  const buildDir = join(artifacts, ARTIFACT_BUILD_DIR);
  const buildManifestPath = join(artifacts, ARTIFACT_BUILD_MANIFEST);
  if (flag(options, 'skipBuild')) {
    const manifest = await verifyExistingBuild(buildDir, buildManifestPath);
    if (
      manifest.frameWhenEmbedded !== true ||
      manifest.includeDevtools !== includeDevtools ||
      manifest.target !== 'artifact'
    ) {
      throw new CliError(
        'validation',
        'The existing artifact build was made with other settings.',
        {
          hint: 'Rebuild without --skip-build (DevTools, embedded frames and the single-chunk artifact target must match this export).',
        }
      );
    }
  } else {
    ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)} for a Claude artifact…`);
    await buildPrototype(ctx, entry, dir, {
      base: './',
      includeDevtools,
      out: buildDir,
      manifestPath: buildManifestPath,
      frameWhenEmbedded: true,
      // One script chunk and one stylesheet: lazy chunks would count against
      // the 511-file version cap (PROTOYARD_TARGET=artifact, renderer config).
      target: 'artifact',
      // 128 px only: 175 avatar files instead of 350 against the 511-file
      // version cap; `avatarUrl(id, 64)` resolves to 128 px (ARTIFACT_AVATAR_SIZES).
      avatarSizes: ARTIFACT_AVATAR_SIZES,
    });
  }

  const foreign = await scanForForeignCode(buildDir, entry, registry.entries);
  if (foreign.length > 0) {
    throw new CliError(
      'validation',
      `The ${entry.slug} bundle contains code from other prototypes.`,
      {
        hint: foreign.map((f) => `${f.file} references ${f.slug} (${f.id})`).join('; '),
        data: { foreign },
      }
    );
  }

  const outDir = join(artifacts, ARTIFACT_OUT_DIR);
  const dryRun = flag(options, 'dryRun');
  const packed = await packArtifact({
    distDir: buildDir,
    outDir,
    slug: entry.slug,
    manifest: {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      category: entry.category,
    },
    capabilities: comments ? { ...ARTIFACT_COMMENT_CAPABILITIES } : null,
    dryRun,
  });
  if (!packed.ok) {
    throw new CliError(
      'validation',
      `${entry.slug} breaks ${packed.issues.length} Claude artifact rule(s).`,
      {
        hint: packed.issues.map((issue) => `${issue.path}: ${issue.reason}`).join('\n'),
        data: { issues: packed.issues, warnings: packed.warnings },
      }
    );
  }
  const { manifest } = packed;
  return {
    slug: entry.slug,
    target: 'artifact',
    dryRun,
    outDir: toPosixRelative(ctx.root, outDir),
    page: toPosixRelative(ctx.root, join(outDir, ARTIFACT_PAGE)),
    files: manifest.files.length,
    totalBytes: manifest.totalBytes,
    batches: manifest.batches.length,
    buildSha256: manifest.buildSha256,
    includeDevtools,
    frameWhenEmbedded: true,
    warnings: manifest.warnings,
    capabilities: manifest.capabilities,
    isolation: { checkedAgainst: registry.entries.length - 1, foreign: [] },
    manifest,
    publish: manifest.batches.map((batch) => publishArguments(manifest, outDir, batch.index)),
  };
}

function renderArtifact(data: ArtifactExportResult): CommandResult['render'] {
  return (out) => {
    const { c } = out;
    out.always(
      `${mark(c, 'pass')} ${data.dryRun ? 'Checked' : 'Packed'} ${c.bold(data.slug)} as a Claude artifact${data.dryRun ? ' (dry run, nothing written)' : ''}`
    );
    out.always(`  page    ${c.cyan(data.page)}`);
    out.always(
      `  files   ${data.files} + the page, ${formatBytes(data.totalBytes)} in ${data.batches} publish batch${data.batches === 1 ? '' : 'es'}`
    );
    out.always(`  sha256  ${data.buildSha256} (build)`);
    out.always(
      `  build   DevTools ${data.includeDevtools ? 'included' : 'excluded'}, explicit shells keep their frame when embedded, one script chunk`
    );
    if (data.capabilities)
      out.always(`  capabilities ${Object.keys(data.capabilities).join(', ')}`);
    for (const warning of data.warnings) out.always(`  ${mark(c, 'warn')} ${warning}`);
    out.info(
      c.dim(
        `  Isolation: no references to the other ${data.isolation.checkedAgainst} registered projects.`
      )
    );
    out.info(
      c.dim(
        '  Publish it with the share-as-artifact skill (--json lists the exact Artifact tool arguments). Artifacts are private until you share them.'
      )
    );
  };
}

export const exportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const target = opt(options, 'target') ?? 'zip';
  if (target === 'artifact') {
    if (flag(options, 'all'))
      throw new CliError('usage', '--target artifact exports one prototype at a time.');
    const { entry, dir, registry } = await resolveTarget(ctx, args[0]);
    const data = await exportArtifact(ctx, entry, dir, registry, options);
    return { data, render: renderArtifact(data) };
  }
  if (flag(options, 'dryRun') || flag(options, 'comments') || options.devtools === false) {
    throw new CliError(
      'usage',
      '--dry-run, --comments and --no-devtools apply to --target artifact only.'
    );
  }
  if (flag(options, 'all')) {
    if (args[0]) throw new CliError('usage', 'Pass either <slug> or --all, not both.');
    return exportAll(ctx, options);
  }
  const { entry, dir, registry } = await resolveTarget(ctx, args[0]);
  const data = await exportOne(ctx, entry, dir, registry, options);
  return {
    data,
    render(out) {
      const { c } = out;
      out.always(`${mark(c, 'pass')} Exported ${c.bold(data.slug)}`);
      out.always(`  ${c.cyan(data.zip)}  ${formatBytes(data.size)}  (${data.files} files)`);
      out.always(`  sha256 ${data.sha256}`);
      out.info(
        c.dim(
          `  Isolation: no references to the other ${data.isolation.checkedAgainst} registered projects.`
        )
      );
      out.info(
        c.dim(
          data.base === './'
            ? '  Relocatable (base ./): unzip into any folder of any static host.'
            : `  Built for base ${data.base}: serve it from that path.`
        )
      );
    },
  };
};

/**
 * Export every prototype sequentially (same order as `build --all`). Continues
 * past failures and exits 1 when any failed. Templates are never included.
 */
async function exportAll(
  ctx: CommandContext,
  options: Record<string, unknown>
): Promise<CommandResult> {
  const registry = await loadRegistry(ctx.paths);
  const targets = registry.entries.filter((e) => e.kind === 'prototype');
  const results: Array<
    | (ExportOneResult & { ok: true; durationMs: number; error?: undefined })
    | {
        ok: false;
        slug: string;
        durationMs: number;
        error: string;
        zip?: undefined;
        sha256?: undefined;
        size?: undefined;
      }
  > = [];

  // Sequential: Vite builds and zips share disk and CPU; failures stay attributable.
  for (const entry of targets) {
    const started = performance.now();
    try {
      const data = await exportOne(ctx, entry, join(ctx.root, entry.path), registry, options);
      results.push({
        ...data,
        ok: true,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      results.push({
        ok: false,
        slug: entry.slug,
        durationMs: Math.round(performance.now() - started),
        error: toCliError(error).message,
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return {
    data: {
      total: results.length,
      failed: failed.length,
      results: results.map((r) =>
        r.ok
          ? {
              slug: r.slug,
              ok: true as const,
              zip: r.zip,
              sha256: r.sha256,
              size: r.size,
              files: r.files,
              durationMs: r.durationMs,
            }
          : {
              slug: r.slug,
              ok: false as const,
              error: r.error,
              durationMs: r.durationMs,
            }
      ),
    },
    ...(failed.length > 0
      ? {
          failure: new CliError('failure', `${failed.length} of ${results.length} exports failed.`),
        }
      : {}),
    render(out) {
      const { c } = out;
      if (results.length === 0) out.always('No prototypes to export.');
      for (const r of results) {
        if (r.ok) {
          out.always(
            `${mark(c, 'pass')} ${r.slug.padEnd(28)} ${(r.durationMs / 1000).toFixed(1).padStart(6)} s  ${formatBytes(r.size)}  ${c.dim(`${r.sha256.slice(0, 12)}…`)}`
          );
        } else {
          out.always(
            `${mark(c, 'fail')} ${r.slug.padEnd(28)} ${(r.durationMs / 1000).toFixed(1).padStart(6)} s  ${c.red(r.error)}`
          );
        }
      }
      if (results.length > 0 && failed.length === 0) {
        out.always(c.green(`\nAll ${results.length} exports succeeded.`));
      }
    },
  };
}
