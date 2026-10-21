import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSlug } from '@protoyard/core';
import type { FolderKind } from './discovery.ts';
import { CliError, type Output } from './output.ts';
import { type WorkspacePaths, workspacePaths } from './paths.ts';
import { findEntry, loadRegistry, type Registry, type RegistryEntry } from './registry.ts';

/** Everything a command needs, resolved once from the global options. */
export interface CommandContext {
  root: string;
  paths: WorkspacePaths;
  out: Output;
  /** `--yes` or CI: never ask, take the documented default. */
  yes: boolean;
  /** Prompts are only allowed on a TTY outside CI and without --json. */
  interactive: boolean;
  ci: boolean;
}

export function createContext(root: string, out: Output, yes: boolean): CommandContext {
  const ci = isCi();
  return {
    root,
    paths: workspacePaths(root),
    out,
    yes: yes || ci,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) && !ci && !out.options.json,
    ci,
  };
}

export function isCi(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.CI;
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

/** Validates the slug's shape before any filesystem lookup. */
export function assertSlug(slug: string | undefined): string {
  if (!slug) throw new CliError('usage', 'Missing <slug>.', { hint: 'Run `pnpm protoyard list`.' });
  const check = checkSlug(slug);
  if (!check.ok) throw new CliError('usage', check.reason);
  return check.slug;
}

export interface ResolvedTarget {
  registry: Registry;
  entry: RegistryEntry;
  dir: string;
}

/** Looks a slug up in a fresh registry; unknown slugs get "did you mean" hints. */
/**
 * `runnable` (the default) accepts prototypes AND templates: a slug is looked
 * up in prototypes/ first, then templates/, so templates can be run, checked
 * and built directly while they are being authored.
 */
export async function resolveTarget(
  ctx: CommandContext,
  rawSlug: string | undefined,
  kind: FolderKind | 'runnable' = 'runnable'
): Promise<ResolvedTarget> {
  const slug = assertSlug(rawSlug);
  const registry = await loadRegistry(ctx.paths);
  const entry =
    kind === 'runnable'
      ? (findEntry(registry, slug, 'prototype') ?? findEntry(registry, slug, 'template'))
      : findEntry(registry, slug, kind);
  if (!entry) {
    const broken = registry.invalid.find((i) => i.path.endsWith(`/${slug}`));
    if (broken) {
      throw new CliError('validation', `${broken.path} has an invalid protoyard.json.`, {
        hint: broken.errors.join(' '),
        data: broken,
      });
    }
    const similar = registry.entries
      .filter((e) => kind === 'runnable' || e.kind === kind)
      .map((e) => e.slug)
      .filter((s) => s.includes(slug) || slug.includes(s) || s.split('-')[0] === slug.split('-')[0])
      .slice(0, 5);
    const noun = kind === 'runnable' ? 'prototype or template' : kind;
    throw new CliError('not_found', `No ${noun} "${slug}" in this workspace.`, {
      hint: similar.length
        ? `Did you mean: ${similar.join(', ')}?`
        : `Run \`pnpm protoyard list --kind ${kind === 'runnable' ? 'all' : kind}\`.`,
    });
  }
  return { registry, entry, dir: join(ctx.root, entry.path) };
}

export interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readPackageJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

/** The CLI's own version, read from its package.json (never hard-coded). */
export const CLI_VERSION: string =
  readPackageJson(fileURLToPath(new URL('../../package.json', import.meta.url)))?.version ??
  '0.0.0';

/**
 * Node's package lookup, without `exports`: the nearest
 * `node_modules/<name>/package.json` at or above `from`. NODE_PATH and global
 * folders are ignored on purpose, so a package counts only when this workspace
 * installed it. Returns the package folder (symlinks kept as found).
 */
export function findInstalledPackage(name: string, from: string): string | null {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', ...name.split('/'));
    if (readPackageJson(join(candidate, 'package.json'))?.name === name) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * The folder of `@protoyard/<folder>`: installed packages first, looked up from
 * each of `from` and then the workspace root (a consumer workspace, or a
 * prototype's own node_modules), then this repository's `packages/<folder>`.
 */
export function protoyardPackageDir(
  root: string,
  folder: string,
  from: readonly string[] = []
): string | null {
  const name = `@protoyard/${folder}`;
  for (const base of [...from, root]) {
    const found = findInstalledPackage(name, base);
    if (found) return found;
  }
  const local = join(root, 'packages', folder);
  return readPackageJson(join(local, 'package.json'))?.name === name ? local : null;
}

/** Like `protoyardPackageDir`, but a missing package is a CliError that says how to fix it. */
export function requireProtoyardPackage(
  root: string,
  folder: string,
  from: readonly string[] = []
): string {
  const dir = protoyardPackageDir(root, folder, from);
  if (dir) return dir;
  throw new CliError('not_found', `@protoyard/${folder} is not installed in this workspace.`, {
    hint: 'Run `pnpm install` (or `npm install`) in the workspace root, then try again.',
  });
}

/**
 * The file a package exports at `subpath` (its `default` or `import`
 * condition), as an absolute path, or null when it is not exported or missing.
 * Reads the installed manifest, so a packed package resolves to its dist file.
 */
export function packageExportFile(dir: string, subpath: string): string | null {
  const manifest = readPackageJson(join(dir, 'package.json')) as
    | (PackageJson & { exports?: Record<string, unknown> })
    | null;
  const target = manifest?.exports?.[subpath];
  const file =
    typeof target === 'string'
      ? target
      : target && typeof target === 'object'
        ? ((target as Record<string, unknown>).default ??
          (target as Record<string, unknown>).import)
        : undefined;
  if (typeof file !== 'string' || !file.startsWith('./')) return null;
  const path = resolve(dir, file);
  return path.startsWith(`${resolve(dir)}/`) && existsSync(path) ? path : null;
}

/**
 * A Protoyard package version for build provenance, found like Node would from
 * `from` (the prototype) and the root, or in this repository; null when absent.
 */
export function workspacePackageVersion(
  root: string,
  folder: string,
  from: readonly string[] = []
): string | null {
  const dir = protoyardPackageDir(root, folder, from);
  return dir ? (readPackageJson(join(dir, 'package.json'))?.version ?? null) : null;
}
