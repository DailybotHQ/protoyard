import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { digestDirectory, type FileDigest, listFiles } from './checksum.ts';
import { findEscapingSymlinks } from './links.ts';
import { CliError } from './output.ts';
import { BUILD_MARKER, guardOutputDir } from './output-guard.ts';
import { childPath, isInside, toPosixRelative } from './paths.ts';
import { type RegistryEntry, writeJsonAtomic } from './registry.ts';
import { normalizeBase, viteBuild } from './vite.ts';
import {
  CLI_VERSION,
  type CommandContext,
  readPackageJson,
  workspacePackageVersion,
} from './workspace.ts';

export const BUILD_MANIFEST_FORMAT = 'protoyard.build';
export const BUILD_MANIFEST_FILENAME = 'build-manifest.json';

export interface BuildManifest {
  format: typeof BUILD_MANIFEST_FORMAT;
  formatVersion: 1;
  slug: string;
  id: string;
  version: string;
  builtAt: string;
  base: string;
  includeDevtools: boolean;
  /** Workspace-relative when inside the workspace, absolute otherwise. */
  outDir: string;
  fileCount: number;
  totalBytes: number;
  files: FileDigest[];
  generator: { name: '@protoyard/cli'; version: string };
  sdk: {
    core: string | null;
    runtime: string | null;
    rendererSvelte: string | null;
    vite: string | null;
  };
  node: string;
}

export interface BuildOptions {
  base?: string;
  includeDevtools?: boolean;
  out?: string;
  /**
   * Where build-manifest.json goes. Default: artifacts/<slug>/ for the default
   * output; for a custom --out only the marker inside it (so a custom build
   * never overwrites the default build's manifest).
   */
  manifestPath?: string;
  /** Permit an --out outside the workspace (must be new, empty or ours). */
  allowExternalOut?: boolean;
}

export interface BuildResult {
  manifest: BuildManifest;
  manifestPath: string;
  outDir: string;
  durationMs: number;
}

/**
 * `artifacts/<slug>/` for prototypes, `artifacts/template-<name>/` for
 * templates — a template and a prototype may share a name without their
 * builds overwriting each other.
 */
export function artifactDir(
  ctx: CommandContext,
  entry: Pick<RegistryEntry, 'kind' | 'slug'>
): string {
  return childPath(
    ctx.paths.artifacts,
    entry.kind === 'template' ? `template-${entry.slug}` : entry.slug
  );
}

/**
 * Vite empties the output directory, so every output folder goes through the
 * allow-list guard (lib/output-guard.ts). The default needs no flag.
 */
export function resolveOutDir(
  ctx: CommandContext,
  entry: Pick<RegistryEntry, 'kind' | 'slug'>,
  out?: string,
  options: { allowExternal?: boolean } = {}
): string {
  return guardOutputDir({
    root: ctx.root,
    paths: ctx.paths,
    requested: out ?? join(artifactDir(ctx, entry), 'dist'),
    marker: BUILD_MARKER,
    ...(options.allowExternal ? { allowExternal: true } : {}),
  });
}

/** Checks that index.html exists and every local asset it references was emitted. */
export async function verifyDist(outDir: string, base: string): Promise<string[]> {
  const problems: string[] = [];
  const indexPath = join(outDir, 'index.html');
  if (!existsSync(indexPath)) return ['index.html was not emitted.'];
  const html = await readFile(indexPath, 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? '');
  for (const ref of refs) {
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) continue;
    let path = ref.split(/[?#]/)[0] ?? '';
    if (base !== './' && path.startsWith(base)) path = path.slice(base.length);
    path = path.replace(/^\.?\//, '');
    if (!path) continue;
    if (!existsSync(join(outDir, path)))
      problems.push(`index.html references missing file "${ref}".`);
  }
  if (!refs.some((r) => /\.js$/.test(r.split(/[?#]/)[0] ?? ''))) {
    problems.push('index.html does not load any JavaScript entry.');
  }
  return problems;
}

export async function buildPrototype(
  ctx: CommandContext,
  entry: RegistryEntry,
  dir: string,
  options: BuildOptions
): Promise<BuildResult> {
  const started = performance.now();
  const manifestRaw = JSON.parse(await readFile(join(dir, 'protoyard.json'), 'utf8')) as {
    build?: { base?: string; includeDevtools?: boolean };
  };
  const base = normalizeBase(options.base, manifestRaw.build?.base ?? './');
  const includeDevtools = options.includeDevtools ?? manifestRaw.build?.includeDevtools ?? false;
  const outDir = resolveOutDir(ctx, entry, options.out, {
    allowExternal: options.allowExternalOut,
  });
  const unsafeLinks = findEscapingSymlinks(dir);
  if (unsafeLinks.length > 0) {
    throw new CliError(
      'validation',
      `${entry.slug} contains symlinks that point outside its folder.`,
      {
        hint: `Builds dereference links, which would publish the targets: ${unsafeLinks.join(', ')}. Replace them with real files.`,
      }
    );
  }
  await mkdir(dirname(outDir), { recursive: true });

  const { code, log } = await viteBuild({
    dir,
    root: ctx.root,
    outDir,
    base,
    includeDevtools,
    quiet: ctx.out.options.json || ctx.out.options.quiet,
  });
  if (code !== 0) {
    throw new CliError('failure', `Vite build failed for ${entry.slug} (exit ${code}).`, {
      hint: log ? log.trim().split('\n').slice(-12).join('\n') : 'See the Vite output above.',
    });
  }
  const problems = await verifyDist(outDir, base);
  if (problems.length > 0) {
    throw new CliError('validation', `Build output for ${entry.slug} is incomplete.`, {
      hint: problems.join(' '),
    });
  }

  const files = await digestDirectory(outDir);
  const viteVersion =
    readPackageJson(join(ctx.root, 'node_modules', 'vite', 'package.json'))?.version ?? null;
  const manifest: BuildManifest = {
    format: BUILD_MANIFEST_FORMAT,
    formatVersion: 1,
    slug: entry.slug,
    id: entry.id,
    version: entry.version,
    builtAt: new Date().toISOString(),
    base,
    includeDevtools,
    outDir: isInside(ctx.root, outDir) ? toPosixRelative(ctx.root, outDir) : outDir,
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    files,
    generator: { name: '@protoyard/cli', version: CLI_VERSION },
    sdk: {
      core: workspacePackageVersion(ctx.root, 'core'),
      runtime: workspacePackageVersion(ctx.root, 'runtime'),
      rendererSvelte: workspacePackageVersion(ctx.root, 'renderer-svelte'),
      vite: viteVersion,
    },
    node: process.versions.node,
  };
  // The marker both proves a later --out run may empty this folder again and
  // records what was built there. It is excluded from digests and ZIPs.
  await writeJsonAtomic(join(outDir, BUILD_MARKER), manifest);
  const isDefaultOut = options.out === undefined;
  const manifestPath =
    options.manifestPath ??
    (isDefaultOut
      ? join(artifactDir(ctx, entry), BUILD_MANIFEST_FILENAME)
      : join(outDir, BUILD_MARKER));
  if (manifestPath !== join(outDir, BUILD_MARKER)) await writeJsonAtomic(manifestPath, manifest);
  return { manifest, manifestPath, outDir, durationMs: performance.now() - started };
}

const TEXT_ASSET = /\.(?:m?js|css|html|json|map|svg|txt|webmanifest)$/i;

export interface ForeignReference {
  file: string;
  id: string;
  slug: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches a manifest-shaped property (`id:"x"`, `"id": 'x'`, ``namespace:`x` ``)
 * — how a bundled protoyard.json looks after minification. A bare mention of
 * an id (e.g. in an error message example) is not a leak.
 */
export function manifestPropertyPattern(key: 'id' | 'namespace', value: string): RegExp {
  return new RegExp(`(?:^|[{,\\s])["'\`]?${key}["'\`]?\\s*:\\s*["'\`]${escapeRegExp(value)}["'\`]`);
}

/**
 * Export isolation guard: a prototype bundle must not contain another
 * registered prototype's manifest (its id, slug + namespace as properties) or
 * its storage database name.
 */
export async function scanForForeignCode(
  outDir: string,
  self: RegistryEntry,
  entries: readonly RegistryEntry[]
): Promise<ForeignReference[]> {
  const others = entries.filter((e) => e.id !== self.id && e.slug !== self.slug);
  if (others.length === 0) return [];
  const needles = others.map((entry) => ({
    entry,
    patterns: [
      manifestPropertyPattern('id', entry.id),
      // A slug alone is a common word; together with its namespace it is a manifest.
      ...(entry.namespace !== self.namespace
        ? [manifestPropertyPattern('namespace', entry.namespace)]
        : []),
      new RegExp(escapeRegExp(`protoyard.${entry.namespace}.data`)),
    ],
  }));
  const found: ForeignReference[] = [];
  for (const file of await listFiles(outDir)) {
    if (!TEXT_ASSET.test(file)) continue;
    if ((await stat(file)).size > 20 * 1024 * 1024) continue;
    const text = await readFile(file, 'utf8');
    for (const needle of needles) {
      if (found.some((f) => f.file === toPosixRelative(outDir, file) && f.id === needle.entry.id))
        continue;
      if (needle.patterns.some((pattern) => pattern.test(text))) {
        found.push({
          file: toPosixRelative(outDir, file),
          id: needle.entry.id,
          slug: needle.entry.slug,
        });
      }
    }
  }
  return found;
}
