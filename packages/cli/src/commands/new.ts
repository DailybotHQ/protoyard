import { existsSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MANIFEST_FILENAME, safeParseManifest } from '@protoyard/core';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { inspectSpec } from '../lib/inspect.ts';
import { CliError, mark, toCliError } from '../lib/output.ts';
import { childPath, isInside, toPosixRelative, workspaceLayout } from '../lib/paths.ts';
import { installWorkspace, runPnpm } from '../lib/pnpm.ts';
import { buildIndex } from '../lib/registry.ts';
import { SPEC_FILES } from '../lib/spec-render.ts';
import { refreshTemplateBrand } from '../lib/template-brand.ts';
import {
  assertSlug,
  CLI_VERSION,
  type CommandContext,
  readPackageJson,
  resolveTarget,
} from '../lib/workspace.ts';
import { specForPrototype } from './spec.ts';

/** Never copied from a template: build output, installs and local state. */
const SKIP_NAMES = new Set([
  // Local secrets and history never travel into a new prototype.
  '.git',
  '.env',
  '.envrc',
  '.npmrc',
  'node_modules',
  'dist',
  '.astro',
  'artifacts',
  '.protoyard',
  '.DS_Store',
  '.turbo',
  '.vite',
  'coverage',
]);

export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const skipped = (name: string) => SKIP_NAMES.has(name) || /^\.env\.(?!example$)/.test(name);

/** POSIX paths `copyTemplate` would copy, in walk order (used by `generate --dry-run`). */
export async function listTemplateFiles(source: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (skipped(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(...(await listTemplateFiles(join(source, entry.name), rel)));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}

/** Copies regular files and folders only; symlinks are skipped so a template cannot point outside. */
export async function copyTemplate(source: string, destination: string): Promise<number> {
  let count = 0;
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (skipped(entry.name)) continue;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) count += await copyTemplate(from, to);
    else if (entry.isFile()) {
      await copyFile(from, to);
      count++;
    }
  }
  return count;
}

export interface NewProjectInput {
  slug: string;
  /** The origin template; null when the copied prototype came from none. */
  template: string | null;
  name: string;
  description?: string;
  /** Set only for consumer workspaces, where workspace ranges must be published versions. */
  consumerPackageVersion?: string;
  now: string;
}

/** Deletes a copied thumbnail file, only when it is a regular file inside `dir`. */
async function removeInheritedThumbnail(dir: string, thumbnail: string) {
  const path = resolve(dir, thumbnail);
  if (path === resolve(dir) || !isInside(dir, path)) return;
  try {
    if ((await lstat(path)).isFile()) await rm(path);
  } catch {}
}

/** Removes monorepo-only test helpers and CSS source paths from consumer copies. */
async function adaptConsumerTemplate(dir: string) {
  const rootTsconfig = resolve(dir, '..', '..', 'tsconfig.base.json');
  const tsconfigPath = join(dir, 'tsconfig.json');
  if (existsSync(tsconfigPath) && !existsSync(rootTsconfig)) {
    const config = JSON.parse(await readFile(tsconfigPath, 'utf8')) as Record<string, unknown>;
    delete config.extends;
    await writeFile(tsconfigPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.css$/.test(entry.name)) {
        const css = await readFile(path, 'utf8');
        const adapted = css.replace(
          /^\s*@source\s+['"]\.\.\/\.\.\/\.\.\/packages\/[^;]+;\s*$/gm,
          ''
        );
        if (adapted !== css) await writeFile(path, adapted);
      } else if (entry.isFile() && /\.[cm]?tsx?$/.test(entry.name)) {
        const source = await readFile(path, 'utf8');
        if (source.includes('../../../tests/support/')) await rm(path);
      }
    }
  };
  await walk(dir);
}

/** Rewrites the copied template's identity files into a new prototype. */
export async function personalize(dir: string, input: NewProjectInput) {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const storage = (raw.storage ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = {
    ...raw,
    id: `local.${input.slug}`,
    slug: input.slug,
    kind: 'prototype',
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    template: input.template ?? undefined,
    storage: { ...storage, namespace: input.slug },
    createdAt: input.now,
    updatedAt: input.now,
  };
  // The source's thumbnail is a screenshot of a different app: drop it so the
  // gallery shows a placeholder until `pnpm thumbnails <slug>` captures this one.
  delete next.thumbnail;
  if (typeof raw.thumbnail === 'string') await removeInheritedThumbnail(dir, raw.thumbnail);
  const parsed = safeParseManifest(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CliError(
      'validation',
      `The generated protoyard.json is invalid: ${issue ? `${issue.path.join('.')} — ${issue.message}` : 'unknown error'}.`,
      {
        hint: `Check templates/${input.template}/protoyard.json (and --name/--description lengths).`,
      }
    );
  }
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);

  const pkgPath = join(dir, 'package.json');
  const pkg = readPackageJson(pkgPath);
  if (pkg) {
    pkg.name = `@prototype/${input.slug}`;
    pkg.private = true;
    if (input.consumerPackageVersion) {
      rewriteWorkspaceDependencies(pkg as Record<string, unknown>, input.consumerPackageVersion);
    }
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  const readmePath = join(dir, 'README.md');
  if (existsSync(readmePath)) {
    const readme = await readFile(readmePath, 'utf8');
    const titled = /^# .*$/m.test(readme)
      ? // A function replacer: "$&" or "$1" in a name must stay literal text.
        readme.replace(/^# .*$/m, () => `# ${input.name}`)
      : `# ${input.name}\n\n${readme}`;
    await writeFile(readmePath, titled);
  }

  // Spec files (docs/SPECS.md) keep their prose; only the title lines change:
  // `# AGENTS.md — <name> (`<slug>`)` and `# <name>: <topic>`.
  for (const file of SPEC_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    const retitled = text.replace(/^# .*$/m, (line) =>
      file === 'AGENTS.md'
        ? `# AGENTS.md — ${input.name} (\`${input.slug}\`)`
        : `# ${input.name}: ${line.includes(': ') ? line.slice(line.lastIndexOf(': ') + 2) : 'spec'}`
    );
    if (retitled !== text) await writeFile(path, retitled);
  }
  await resolveTemplateBrand(dir);
  if (input.consumerPackageVersion) await adaptConsumerTemplate(dir);
}

/**
 * The deck template keeps its brand resolved in `src/brand-theme.ts`, so a
 * new deck's first chunk never loads the palette generator. Rewrites that
 * module from the copied `src/blueprint.json` (scaffold time), so the
 * prototype always starts with the brand its blueprint names.
 */
async function resolveTemplateBrand(dir: string): Promise<void> {
  const result = await refreshTemplateBrand(dir);
  if (result.status === 'invalid') {
    throw new CliError('validation', result.message, {
      hint: 'Run `pnpm protoyard blueprint validate <file>` on the source blueprint.',
    });
  }
}

/** Replaces pnpm workspace ranges in every dependency section with a published lockstep version. */
export function rewriteWorkspaceDependencies(pkg: Record<string, unknown>, version: string): void {
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const dependencies = pkg[section];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier === 'string' && specifier.startsWith('workspace:')) {
        (dependencies as Record<string, unknown>)[name] = version;
      }
    }
  }
}

export interface NewSpecResult {
  ok: boolean;
  /** Spec files created because the template had none. */
  created: number;
  /** Files whose generated regions were refreshed for the new slug. */
  updated: number;
  error?: string;
}

/**
 * Fills the new prototype's spec for its own slug: missing files are created
 * and generated regions refreshed from its definition (child process). Never
 * fails `new`: the prototype is usable without it, and
 * `pnpm protoyard spec <slug> --write` can be re-run after `pnpm install`.
 */
export async function writeNewSpec(ctx: CommandContext, dir: string): Promise<NewSpecResult> {
  try {
    const facts = await inspectSpec(ctx.root, dir);
    const result = await specForPrototype(dir, facts, { mode: 'write', init: true });
    const invalid = result.files.find((f) => f.error);
    if (invalid) return { ok: false, created: 0, updated: 0, error: invalid.error };
    return {
      ok: true,
      created: result.files.filter((f) => f.created).length,
      updated: result.files.filter((f) => f.updated).length,
    };
  } catch (error) {
    return { ok: false, created: 0, updated: 0, error: toCliError(error).message };
  }
}

type Existing = 'none' | 'empty' | 'same' | 'other';

async function inspectDestination(
  dest: string,
  slug: string,
  template: string | null
): Promise<Existing> {
  if (!existsSync(dest)) return 'none';
  const names = await readdir(dest).catch(() => null);
  if (names === null) return 'other';
  if (names.filter((n) => n !== '.DS_Store').length === 0) return 'empty';
  try {
    const raw = JSON.parse(await readFile(join(dest, MANIFEST_FILENAME), 'utf8')) as Record<
      string,
      unknown
    >;
    // A previous run of this exact command: safe to resume (retry-safe).
    if (raw.id === `local.${slug}` && raw.slug === slug && (raw.template ?? null) === template)
      return 'same';
  } catch {
    // unreadable → not ours
  }
  return 'other';
}

export interface CreateInput {
  slug: string;
  /** A template, or an existing prototype to remix (prototypes win, like `dev`). */
  from: string;
  /** Restrict `from` to templates (the historical `--template` flag). */
  templatesOnly?: boolean;
  name?: string;
  description?: string;
  /** Reuse an EXISTING EMPTY folder; never overwrites files. */
  force?: boolean;
  /**
   * `auto`: `pnpm install --offline`, then a normal install (CLI default).
   * `offline`: offline only; when it fails, report the command instead (control server).
   * `skip`: do not link.
   */
  install: 'auto' | 'offline' | 'skip';
  stdio: 'pipe' | 'inherit';
}

export interface CreateResult {
  slug: string;
  id: string;
  name: string;
  /** Kind and slug of the copied source. */
  source: { kind: 'template' | 'prototype'; slug: string };
  /** The manifest `template` of the new prototype (the template it ultimately comes from). */
  template: string | null;
  path: string;
  dir: string;
  created: boolean;
  files: number;
  install: { ok: boolean; skipped: boolean; mode?: string; log?: string; command?: string };
  spec: NewSpecResult;
  indexed: boolean;
  nextSteps: string[];
}

/**
 * Copies a template or an existing prototype into prototypes/<slug>: never
 * over existing files, staged then renamed, with a fresh id, name and storage
 * namespace. Shared by `protoyard new` and the control server's POST /api/new.
 */
export async function createPrototypeFrom(
  ctx: CommandContext,
  input: CreateInput
): Promise<CreateResult> {
  const slug = assertSlug(input.slug);
  const fromSlug = assertSlug(input.from);
  const {
    entry: source,
    dir: sourceDir,
    registry,
  } = await resolveTarget(ctx, fromSlug, input.templatesOnly ? 'template' : 'runnable');
  // 'runnable' resolves prototypes and templates only; this narrows the registry kind.
  if (source.kind === 'blueprint') {
    throw new CliError('usage', `"${source.slug}" is a blueprint, not a template or prototype.`, {
      hint: `pnpm protoyard generate ${slug} --blueprint blueprints/${source.slug}.json`,
    });
  }
  // A prototype keeps the template it came from; a template is its own origin.
  const origin = source.kind === 'template' ? source.slug : source.template;
  const name = input.name ?? titleFromSlug(slug);

  await mkdir(ctx.paths.prototypes, { recursive: true });
  const prototypesReal = await realpath(ctx.paths.prototypes);
  const dest = childPath(prototypesReal, slug);
  if (!isInside(prototypesReal, dest)) {
    throw new CliError('unsafe_path', `Refusing to write outside prototypes/: ${dest}`);
  }

  const clash = registry.entries.find((e) => e.id === `local.${slug}` && e.slug !== slug);
  if (clash) {
    throw new CliError('conflict', `id "local.${slug}" is already used by ${clash.path}.`);
  }

  const existing = await inspectDestination(dest, slug, origin);
  if (existing === 'other') {
    throw new CliError(
      'conflict',
      `prototypes/${slug} already exists and was not created from "${source.slug}".`,
      {
        hint: 'Choose another slug. --force only reuses an EMPTY folder; it never overwrites files.',
      }
    );
  }
  if (existing === 'empty' && !input.force) {
    throw new CliError('conflict', `prototypes/${slug} exists (empty).`, {
      hint: 'Re-run with --force to use the empty folder.',
    });
  }

  let files = 0;
  const created = existing !== 'same';
  if (created) {
    // Build in a hidden sibling, then rename: an interrupted run never leaves
    // a half-copied prototype that discovery would index.
    const staging = childPath(prototypesReal, `.${slug}.staging-${process.pid}`);
    await rm(staging, { recursive: true, force: true });
    try {
      files = await copyTemplate(sourceDir, staging);
      await personalize(staging, {
        slug,
        template: origin,
        name,
        ...(workspaceLayout(ctx.root) === 'consumer'
          ? { consumerPackageVersion: CLI_VERSION }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        now: new Date().toISOString(),
      });
      if (existing === 'empty') await rm(dest, { recursive: true, force: true });
      await rename(staging, dest);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  let install: CreateResult['install'];
  if (input.install === 'skip') install = { ok: true, skipped: true };
  else if (input.install === 'offline') {
    // Never reaches the network: links only when every dependency is already in the store.
    const offline = await runPnpm(['install', '--offline'], {
      cwd: ctx.root,
      stdio: 'pipe',
      timeoutMs: 300_000,
    });
    install =
      offline.code === 0
        ? { ok: true, skipped: false, mode: 'offline' }
        : { ok: false, skipped: false, mode: 'offline', command: 'pnpm install' };
  } else {
    const result = await installWorkspace(ctx.root, input.stdio);
    install = {
      ok: result.ok,
      skipped: false,
      mode: result.mode,
      ...(result.ok ? {} : { log: result.log, command: 'pnpm install' }),
    };
  }

  // After install, so the definition's workspace packages resolve.
  const spec = await writeNewSpec(ctx, dest);

  const index = await buildIndex(ctx.paths);
  const nextSteps = [
    ...(install.ok && !install.skipped ? [] : ['pnpm install']),
    `pnpm protoyard dev ${slug}`,
    `pnpm protoyard validate ${slug}`,
    `pnpm protoyard build ${slug}`,
  ];
  return {
    slug,
    id: `local.${slug}`,
    name,
    source: { kind: source.kind, slug: source.slug },
    template: origin,
    // dest is canonical (realpath), so the root must be too: /var vs /private/var on macOS.
    path: toPosixRelative(await realpath(ctx.root), dest),
    dir: dest,
    created,
    files,
    install,
    spec,
    indexed: index.registry.entries.some((e) => e.slug === slug && e.kind === 'prototype'),
    nextSteps,
  };
}

export const newCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const template = opt(options, 'template');
  const from = opt(options, 'from');
  if (template !== undefined && from !== undefined) {
    throw new CliError('usage', 'Pass --template or --from, not both.');
  }
  if (template === undefined && from === undefined) {
    throw new CliError('usage', 'Missing --template <name> or --from <template|prototype>.', {
      hint: 'Run `pnpm protoyard list` to see the templates and prototypes you can start from.',
    });
  }
  const name = opt(options, 'name');
  const description = opt(options, 'description');
  const result = await createPrototypeFrom(ctx, {
    slug: args[0] ?? '',
    from: (template ?? from) as string,
    templatesOnly: template !== undefined,
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    force: flag(options, 'force'),
    install: options.install === false ? 'skip' : 'auto',
    stdio: ctx.out.options.json ? 'pipe' : 'inherit',
  });
  const { dir: _dir, ...data } = result;
  return {
    data,
    render(out) {
      const { c } = out;
      const from = `${result.source.kind} ${c.cyan(result.source.slug)}`;
      out.always(
        result.created
          ? `${mark(c, 'pass')} Created ${c.bold(result.path)} from ${from} (${result.files} files)`
          : `${mark(c, 'pass')} ${c.bold(result.path)} already exists from ${from} — resumed`
      );
      if (result.install.skipped)
        out.info(`${mark(c, 'skip')} Skipped pnpm install (--no-install)`);
      else if (result.install.ok)
        out.info(
          `${mark(c, 'pass')} Linked into the workspace (pnpm install --${result.install.mode})`
        );
      else {
        out.warn(`${mark(c, 'warn')} pnpm install failed — run it manually before \`dev\`.`);
        if (result.install.log) out.warn(c.dim(result.install.log));
      }
      if (result.spec.ok)
        out.info(
          `${mark(c, 'pass')} Spec: AGENTS.md and docs/ filled for ${result.slug} (${result.spec.created} created, ${result.spec.updated} refreshed)`
        );
      else {
        out.warn(
          `${mark(c, 'warn')} Spec regions not refreshed: ${result.spec.error ?? 'unknown error'}`
        );
        out.warn(
          c.dim(
            `  Run \`pnpm protoyard spec ${result.slug} --init --write\` once the prototype loads.`
          )
        );
      }
      out.info('\nNext steps:');
      for (const step of result.nextSteps) out.info(`  ${c.cyan(step)}`);
    },
  };
};
