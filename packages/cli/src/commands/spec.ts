import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { artifactDir } from '../lib/build.ts';
import { sha256Text } from '../lib/checksum.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { scanText } from '../lib/hygiene.ts';
import { inspectSpec, type SpecFacts } from '../lib/inspect.ts';
import { findEscapingSymlinks } from '../lib/links.ts';
import { CliError, formatBytes, mark, toCliError } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
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
import { type ZipEntry, zipEntries } from '../lib/zip.ts';

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
  bundle?: RebuildKit;
  /** Why the rebuild kit was refused (spec incomplete, symlink, hygiene). */
  bundleError?: string;
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
      // --check is read-only, so it never creates skeletons even with --init.
      if (options.init && options.mode !== 'check') {
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

/** Files and folders a rebuild kit may contain; nothing else is ever read. */
const KIT_FILES = [
  'AGENTS.md',
  'README.md',
  'protoyard.json',
  'src/prototype.ts',
  'src/routes.ts',
  'src/database/schema.ts',
] as const;
const KIT_DIRS = ['docs', 'src/domain', 'src/scenarios'] as const;
const KIT_EXTENSION = /\.(md|ts|json)$/;
const TEST_FILE = /\.(test|spec)\.ts$/;

export interface RebuildKit {
  /** Workspace-relative ZIP path. */
  path: string;
  sha256: string;
  size: number;
  files: { path: string; bytes: number; sha256: string }[];
}

/** Allow-listed files that exist, as sorted POSIX paths; refuses any symlink on the way. */
export async function kitFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const refuseLink = async (rel: string) => {
    if ((await lstat(join(dir, rel))).isSymbolicLink()) {
      throw new CliError('validation', `${rel} is a symlink; a rebuild kit never follows links.`);
    }
  };
  for (const rel of KIT_FILES) {
    if (!existsSync(join(dir, rel))) continue;
    await refuseLink(rel);
    out.push(rel);
  }
  const walk = async (rel: string): Promise<void> => {
    await refuseLink(rel);
    for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) await refuseLink(child);
      else if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && KIT_EXTENSION.test(entry.name) && !TEST_FILE.test(entry.name))
        out.push(child);
    }
  };
  for (const rel of KIT_DIRS) if (existsSync(join(dir, rel))) await walk(rel);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The kit's own entry point: deterministic (no clock), lists every file with its hash. */
export function rebuildPrompt(facts: SpecFacts, files: RebuildKit['files']): string {
  const { name, slug, version } = facts.manifest;
  return `# Rebuild kit: ${name} (\`${slug}\` v${version})

This kit describes a working Protoyard prototype so that a team or an agent
can build it as a real application. The prototype runs entirely in the
browser on simulated infrastructure (an IndexedDB database per visitor,
personas instead of sign-in, simulated permissions, network and time). None
of its code is meant to be deployed as is.

## Contents

| File | Bytes | sha256 |
| --- | ---: | --- |
${files.map((f) => `| \`${f.path}\` | ${f.bytes} | \`${f.sha256}\` |`).join('\n')}

## How to use it

1. Read \`AGENTS.md\`, then \`docs/SPEC.md\`, especially "Honest boundaries"
   and "Rebuild as a real app".
2. Model the server data from \`docs/DATA_MODEL.md\` and
   \`src/database/schema.ts\`: ids, indexes, relations and migrations carry over.
3. Turn every flow in \`docs/FLOWS.md\` into an endpoint or server action with
   the same inputs, permission checks and transaction boundaries as
   \`src/domain/services.ts\`.
4. Enforce \`docs/PERMISSIONS.md\` on the server for every request. In the
   prototype it is simulated UX, never security.
5. Rebuild each screen in \`docs/SCREENS.md\`, including its empty, loading,
   error and denied states.
6. Reuse \`src/scenarios/\` as seed data for staging, demo accounts and tests.

## Prompt for an agent

\`\`\`text
You are building "${name}" as a production application from this rebuild kit.
Treat docs/ as the specification and src/ as a reference implementation of
the behavior, not as code to copy. Keep every user flow, permission rule,
validation and state described in docs/. Replace each simulated part named
in docs/SPEC.md ("Honest boundaries") with a real, secure implementation,
and ask before choosing any external vendor or service. Start by proposing
the data model and the API surface, mapped to docs/DATA_MODEL.md and
docs/FLOWS.md, and wait for approval before writing code.
\`\`\`

Generated by \`protoyard spec ${slug} --bundle\` from the prototype's
definition and spec files. All data in this kit is fictional.
`;
}

/**
 * Builds artifacts/<slug>/<slug>-rebuild-kit.zip from a current spec. Refuses
 * a missing or stale spec, symlinks leaving the folder, and any
 * public-hygiene finding (reported as path:line rule, never the text).
 */
export async function buildRebuildKit(
  ctx: CommandContext,
  entry: RegistryEntry,
  dir: string,
  facts: SpecFacts,
  spec: Omit<SpecSlugResult, 'slug' | 'ok'>
): Promise<RebuildKit> {
  const missing = spec.files.filter((f) => !f.exists).map((f) => f.path);
  if (missing.length > 0) {
    throw new CliError(
      'validation',
      `${entry.slug} has no complete spec to bundle (missing ${missing.join(', ')}).`,
      {
        hint: `Run \`pnpm protoyard spec ${entry.slug} --init\` and write the prose first.`,
      }
    );
  }
  if (spec.stale > 0 || spec.files.some((f) => f.error)) {
    throw new CliError('validation', `The ${entry.slug} spec is not current.`, {
      hint: `Run \`pnpm protoyard spec ${entry.slug} --write\`, then bundle again.`,
    });
  }
  const escaping = findEscapingSymlinks(dir);
  if (escaping.length > 0) {
    throw new CliError(
      'validation',
      `${entry.slug} contains symlinks that point outside its folder.`,
      {
        hint: escaping.join(', '),
      }
    );
  }
  const paths = await kitFiles(dir);
  const entries: ZipEntry[] = [];
  const files: RebuildKit['files'] = [];
  const findings = [];
  for (const rel of paths) {
    const data = new Uint8Array(await readFile(join(dir, rel)));
    findings.push(...scanText(rel, new TextDecoder().decode(data)));
    entries.push({ name: rel, data });
    files.push({ path: rel, bytes: data.byteLength, sha256: sha256Text(data) });
  }
  if (findings.length > 0) {
    throw new CliError(
      'validation',
      `${entry.slug} files fail the public-hygiene rules; nothing was bundled.`,
      {
        hint: findings.map((f) => `${f.path}:${f.line} ${f.rule}`).join('; '),
      }
    );
  }
  const prompt = new TextEncoder().encode(rebuildPrompt(facts, files));
  const ordered = [{ name: 'REBUILD.md', data: prompt }, ...entries];
  const destination = join(artifactDir(ctx, entry), `${entry.slug}-rebuild-kit.zip`);
  await mkdir(dirname(destination), { recursive: true });
  const zip = await zipEntries(ordered, destination);
  return {
    path: toPosixRelative(ctx.root, zip.path),
    sha256: zip.sha256,
    size: zip.size,
    files: [{ path: 'REBUILD.md', bytes: prompt.byteLength, sha256: sha256Text(prompt) }, ...files],
  };
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
  if (init && check) {
    throw new CliError('usage', 'Pass --init or --check, not both: --check never writes files.', {
      hint: 'Create the missing files with --init (or --init --write), then run --check.',
    });
  }
  const bundle = flag(options, 'bundle');
  const targets = await targetsFor(ctx, args[0], flag(options, 'all'));

  const results: SpecSlugResult[] = [];
  for (const entry of targets) {
    ctx.out.info(`Reading the ${ctx.out.c.bold(entry.slug)} definition…`);
    try {
      const facts = await inspectSpec(ctx.root, join(ctx.root, entry.path));
      const dir = join(ctx.root, entry.path);
      const result = await specForPrototype(dir, facts, { mode, init });
      const markerErrors = result.files.filter((f) => f.error);
      let kit: RebuildKit | undefined;
      let bundleError: string | undefined;
      if (bundle) {
        try {
          kit = await buildRebuildKit(ctx, entry, dir, facts, result);
        } catch (error) {
          const err = toCliError(error);
          bundleError = err.hint ? `${err.message} ${err.hint}` : err.message;
        }
      }
      results.push({
        slug: entry.slug,
        ok:
          markerErrors.length === 0 &&
          (mode !== 'check' || result.stale === 0) &&
          bundleError === undefined,
        ...result,
        ...(kit ? { bundle: kit } : {}),
        ...(bundleError ? { bundleError } : {}),
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
  const refusedKits = results.filter((r) => r.bundleError);
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
          : refusedKits.length > 0
            ? new CliError(
                'validation',
                `No rebuild kit for ${refusedKits.map((r) => r.slug).join(', ')}.`,
                {
                  hint: refusedKits.map((r) => `${r.slug}: ${r.bundleError}`).join(' '),
                }
              )
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
        if (r.bundle) {
          out.always(
            `  ${mark(c, 'pass')} rebuild kit ${c.cyan(r.bundle.path)} (${r.bundle.files.length} files, ${formatBytes(r.bundle.size)})`
          );
          out.always(`    sha256 ${r.bundle.sha256}`);
        }
        if (r.bundleError)
          out.always(`  ${mark(c, 'fail')} rebuild kit refused: ${c.red(r.bundleError)}`);
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
