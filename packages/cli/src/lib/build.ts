import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { digestDirectory, type FileDigest, listFiles } from './checksum.ts';
import { CliError } from './output.ts';
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
  /** Where build-manifest.json goes (default: next to dist in the artifact folder). */
  manifestPath?: string;
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
 * Vite empties the output directory, so a custom `--out` must never be (or
 * contain) the workspace or any source folder.
 */
export function resolveOutDir(
  ctx: CommandContext,
  entry: Pick<RegistryEntry, 'kind' | 'slug'>,
  out?: string
): string {
  if (!out) return join(artifactDir(ctx, entry), 'dist');
  const target = resolve(ctx.root, out);
  const protectedDirs = [
    ctx.root,
    ctx.paths.prototypes,
    ctx.paths.templates,
    join(ctx.root, 'packages'),
    join(ctx.root, 'apps'),
    join(ctx.root, 'node_modules'),
    join(ctx.root, '.git'),
  ];
  for (const dir of protectedDirs) {
    if (isInside(target, dir) || (dir !== ctx.root && isInside(dir, target))) {
      throw new CliError(
        'unsafe_path',
        `Refusing --out ${target}: it would overwrite source files.`,
        {
          hint: 'Use a dedicated folder such as artifacts/<slug>/dist (the default) or tmp/out.',
        }
      );
    }
  }
  return target;
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
  const outDir = resolveOutDir(ctx, entry, options.out);
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
  const manifestPath =
    options.manifestPath ?? join(artifactDir(ctx, entry), BUILD_MANIFEST_FILENAME);
  await writeJsonAtomic(manifestPath, manifest);
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
