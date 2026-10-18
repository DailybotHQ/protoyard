import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { inspectSpec, type SpecFacts } from '../lib/inspect.ts';
import { CliError, mark, toCliError } from '../lib/output.ts';
import { loadRegistry, type RegistryEntry } from '../lib/registry.ts';
import {
  type RegionStatus,
  refreshRegions,
  SPEC_FILES,
  type SpecFile,
  SpecMarkerError,
  skeleton,
} from '../lib/spec-render.ts';
import { type CommandContext, resolveTarget } from '../lib/workspace.ts';

type Mode = 'report' | 'write' | 'check';

export interface SpecFileResult {
  path: string;
  exists: boolean;
  created: boolean;
  updated: boolean;
  regions: RegionStatus[];
  error?: string;
}

export interface SpecSlugResult {
  slug: string;
  ok: boolean;
  files: SpecFileResult[];
  stale: number;
  warnings: string[];
  error?: string;
}

async function writeTextAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, path);
}

/** Applies one mode to one prototype's spec files; facts come from its definition. */
export async function specForPrototype(
  dir: string,
  facts: SpecFacts,
  options: { mode: Mode; init: boolean }
): Promise<Omit<SpecSlugResult, 'slug' | 'ok'>> {
  const files: SpecFileResult[] = [];
  for (const file of SPEC_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      if (options.init) {
        // Created whole: TODO prompts for prose, generated regions already filled.
        await writeTextAtomic(path, skeleton(file, facts));
        const { regions } = refreshRegions(file, await readFile(path, 'utf8'), facts);
        files.push({ path: file, exists: true, created: true, updated: false, regions });
      } else {
        files.push({ path: file, exists: false, created: false, updated: false, regions: [] });
      }
      continue;
    }
    const text = await readFile(path, 'utf8');
    try {
      const refreshed = refreshRegions(file as SpecFile, text, facts);
      const changed = refreshed.text !== text;
      if (changed && options.mode === 'write') await writeTextAtomic(path, refreshed.text);
      files.push({
        path: file,
        exists: true,
        created: false,
        updated: changed && options.mode === 'write',
        regions: refreshed.regions,
      });
    } catch (error) {
      if (!(error instanceof SpecMarkerError)) throw error;
      files.push({
        path: file,
        exists: true,
        created: false,
        updated: false,
        regions: [],
        error: error.message,
      });
    }
  }
  const stale = files.reduce(
    (n, f) => n + (f.updated ? 0 : f.regions.filter((r) => r.status === 'stale').length),
    0
  );
  return { files, stale, warnings: facts.warnings };
}

async function targetsFor(
  ctx: CommandContext,
  slug: string | undefined,
  all: boolean
): Promise<RegistryEntry[]> {
  if (all) {
    if (slug) throw new CliError('usage', 'Pass either <slug> or --all, not both.');
    return (await loadRegistry(ctx.paths)).entries.filter((e) => e.kind === 'prototype');
  }
  if (!slug) throw new CliError('usage', 'Pass a prototype slug or --all.');
  return [(await resolveTarget(ctx, slug)).entry];
}

const STATUS_MARK: Record<RegionStatus['status'], 'pass' | 'warn' | 'fail' | 'skip'> = {
  fresh: 'pass',
  stale: 'fail',
  absent: 'skip',
  unknown: 'warn',
};

/**
 * `protoyard spec <slug|--all> [--write|--check] [--init]`: keeps the
 * generated regions of a prototype's AGENTS.md and docs/ in sync with its
 * definition (docs/SPECS.md). Prose outside the markers is never touched.
 */
export const specCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const write = flag(options, 'write');
  const check = flag(options, 'check');
  if (write && check) throw new CliError('usage', 'Pass --write or --check, not both.');
  const mode: Mode = write ? 'write' : check ? 'check' : 'report';
  const init = flag(options, 'init');
  const targets = await targetsFor(ctx, args[0], flag(options, 'all'));

  const results: SpecSlugResult[] = [];
  for (const entry of targets) {
    ctx.out.info(`Reading the ${ctx.out.c.bold(entry.slug)} definition…`);
    try {
      const facts = await inspectSpec(ctx.root, join(ctx.root, entry.path));
      const result = await specForPrototype(join(ctx.root, entry.path), facts, { mode, init });
      const markerErrors = result.files.filter((f) => f.error);
      results.push({
        slug: entry.slug,
        ok: markerErrors.length === 0 && (mode !== 'check' || result.stale === 0),
        ...result,
      });
    } catch (error) {
      results.push({
        slug: entry.slug,
        ok: false,
        files: [],
        stale: 0,
        warnings: [],
        error: toCliError(error).message,
      });
    }
  }

  const stale = results.reduce((n, r) => n + r.stale, 0);
  const markerErrors = results.flatMap((r) =>
    r.files.filter((f) => f.error).map((f) => `${r.slug}/${f.error}`)
  );
  const failedLoads = results.filter((r) => r.error);
  const failure =
    failedLoads.length > 0
      ? new CliError(
          'failure',
          `Could not read the definition of ${failedLoads.map((r) => r.slug).join(', ')}.`,
          {
            hint: failedLoads.map((r) => r.error).join(' '),
          }
        )
      : markerErrors.length > 0
        ? new CliError('validation', 'Spec files have invalid generated-region markers.', {
            hint: markerErrors.join(' '),
          })
        : mode === 'check' && stale > 0
          ? new CliError('validation', `${stale} generated spec region(s) are stale.`, {
              hint: `Run \`pnpm protoyard spec ${targets.length === 1 ? targets[0]?.slug : '--all'} --write\`.`,
            })
          : undefined;

  return {
    data: { mode, init, total: results.length, stale, results },
    ...(failure ? { failure } : {}),
    render(out) {
      const { c } = out;
      for (const r of results) {
        out.always(
          `${mark(c, r.ok ? 'pass' : 'fail')} ${c.bold(r.slug)}${r.error ? `  ${c.red(r.error)}` : ''}`
        );
        const existing = r.files.filter((f) => f.exists);
        if (!r.error && existing.length === 0) {
          out.always(
            c.dim(`  no spec files yet: \`pnpm protoyard spec ${r.slug} --init\` creates them`)
          );
        }
        for (const f of r.files) {
          if (!f.exists) continue;
          const action = f.created
            ? 'created'
            : f.updated
              ? 'updated'
              : f.error
                ? 'invalid'
                : 'checked';
          out.always(
            `  ${c.dim(action.padEnd(8))} ${f.path}${f.error ? `  ${c.red(f.error)}` : ''}`
          );
          for (const region of f.regions) {
            if (region.status === 'fresh' && !f.updated) continue;
            const label = f.updated && region.status === 'stale' ? 'refreshed' : region.status;
            out.info(
              `    ${mark(c, f.updated && region.status === 'stale' ? 'pass' : STATUS_MARK[region.status])} ${region.id} ${c.dim(label)}`
            );
          }
        }
        for (const warning of r.warnings) out.always(c.yellow(`  ! ${warning}`));
      }
      const checked = results.some((r) => r.files.some((f) => f.exists));
      if (!failure && mode === 'check')
        out.always(
          checked
            ? c.green('All generated spec regions are current.')
            : c.dim('No spec files to check.')
        );
    },
  };
};
