import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import { flag } from '../lib/command.ts';
import { CliError, formatBytes, mark, toCliError } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { loadRegistry, type Registry, type RegistryEntry } from '../lib/registry.ts';
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

export const exportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
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
