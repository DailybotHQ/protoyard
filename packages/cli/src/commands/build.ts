import { join } from 'node:path';
import type { BuildOptions } from '../lib/build.ts';
import { buildPrototype } from '../lib/build.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, formatBytes, mark, toCliError } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { loadRegistry } from '../lib/registry.ts';
import { resolveTarget } from '../lib/workspace.ts';

export function buildOptionsFrom(options: Record<string, unknown>): BuildOptions {
  return {
    ...(opt(options, 'base') !== undefined ? { base: opt(options, 'base') } : {}),
    ...(flag(options, 'includeDevtools') ? { includeDevtools: true } : {}),
    ...(opt(options, 'out') !== undefined ? { out: opt(options, 'out') } : {}),
  };
}

export const buildCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const buildOptions = buildOptionsFrom(options);
  if (flag(options, 'all')) {
    if (args[0]) throw new CliError('usage', 'Pass either <slug> or --all, not both.');
    if (buildOptions.out) throw new CliError('usage', '--out cannot be combined with --all.');
    return buildAll(ctx, buildOptions);
  }
  const { entry, dir } = await resolveTarget(ctx, args[0]);
  ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)}…`);
  const result = await buildPrototype(ctx, entry, dir, buildOptions);
  const { manifest } = result;
  return {
    data: {
      slug: entry.slug,
      outDir: manifest.outDir,
      buildManifest: toPosixRelative(ctx.root, result.manifestPath),
      base: manifest.base,
      includeDevtools: manifest.includeDevtools,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
      durationMs: Math.round(result.durationMs),
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Built ${c.bold(entry.slug)} → ${c.cyan(manifest.outDir)} (${manifest.fileCount} files, ${formatBytes(manifest.totalBytes)}, ${(result.durationMs / 1000).toFixed(1)} s)`
      );
      out.info(
        c.dim(
          `  base ${manifest.base} · devtools ${manifest.includeDevtools ? 'included' : 'excluded'}`
        )
      );
      out.info(`  Preview: ${c.cyan(`pnpm protoyard preview ${entry.slug}`)}`);
    },
  };
};

async function buildAll(
  ctx: Parameters<Handler>[0],
  buildOptions: BuildOptions
): Promise<CommandResult> {
  const registry = await loadRegistry(ctx.paths);
  const targets = registry.entries.filter((e) => e.kind === 'prototype');
  const results: {
    slug: string;
    ok: boolean;
    durationMs: number;
    totalBytes?: number;
    error?: string;
  }[] = [];
  // Sequential on purpose: parallel Vite builds compete for CPU and memory and
  // make failures harder to attribute.
  for (const entry of targets) {
    ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)}…`);
    const started = performance.now();
    try {
      const result = await buildPrototype(ctx, entry, join(ctx.root, entry.path), buildOptions);
      results.push({
        slug: entry.slug,
        ok: true,
        durationMs: Math.round(result.durationMs),
        totalBytes: result.manifest.totalBytes,
      });
    } catch (error) {
      results.push({
        slug: entry.slug,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        error: toCliError(error).message,
      });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return {
    data: { total: results.length, failed: failed.length, results },
    ...(failed.length > 0
      ? { failure: new CliError('failure', `${failed.length} of ${results.length} builds failed.`) }
      : {}),
    render(out) {
      const { c } = out;
      if (results.length === 0) out.always('No prototypes to build.');
      for (const r of results) {
        out.always(
          `${mark(c, r.ok ? 'pass' : 'fail')} ${r.slug.padEnd(28)} ${(r.durationMs / 1000).toFixed(1).padStart(6)} s  ${
            r.ok ? formatBytes(r.totalBytes ?? 0) : c.red(r.error ?? '')
          }`
        );
      }
      if (results.length > 0 && failed.length === 0)
        out.always(c.green(`\nAll ${results.length} builds succeeded.`));
    },
  };
}
