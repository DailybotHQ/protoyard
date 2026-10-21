import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveReviewBuild } from '@protoyard/core/manifest';
import { analyzeBundle, type BundleReport } from './bundle-analysis.ts';
import { digestDirectory, type FileDigest, listFiles } from './checksum.ts';
import { findEscapingSymlinks } from './links.ts';
import { type OfflineRecord, readOfflineRecord } from './offline.ts';
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
  /** The opt-in service worker (dist/sw.js), or false when the build has none. */
  offline: OfflineRecord;
  /** Keeps an explicit shell frame when embedded (ADR-026); absent in older manifests. */
  frameWhenEmbedded?: boolean;
  /** Review activation and adapter kind only; never store endpoint credentials here. */
  review: { enabled: boolean; adapter: 'local' | 'cloudflare' | 'http' | 'artifact' };
  /**
   * Initial vs lazy JS, CSS and whole-dist sizes (gzip level 9). Absent when
   * the build wrote no Vite manifest (a config without defineProtoyardConfig).
   */
  bundle?: BundleReport;
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
  /** Force the offline service worker on (PROTOYARD_OFFLINE=1). */
  offline?: boolean;
  /** Keep an explicit shell frame when embedded (the Claude artifact target). */
  frameWhenEmbedded?: boolean;
  /** Bake this storage namespace in instead of the manifest's (template demos). */
  storageNamespace?: string;
  /** Point avatar images at a shared folder and emit none (the showcase). */
  avatarBase?: string;
  /** Ship only these avatar sizes (the artifact target ships 128). */
  avatarSizes?: readonly number[];
  /** Force review comments on with this adapter (`publish --comments`: http, `/api/comments`). */
  review?: { adapter: 'http' | 'cloudflare'; endpoint: string };
}

export interface BuildResult {
  manifest: BuildManifest;
  manifestPath: string;
  outDir: string;
  durationMs: number;
}

/** Folders under artifacts/ that belong to the CLI itself, not to a prototype. */
export const RESERVED_ARTIFACT_NAMES: ReadonlySet<string> = new Set([
  'templates',
  'showcase',
  'showcase-builds',
  'publish',
  'review',
]);

/**
 * `artifacts/<slug>/` for prototypes, `artifacts/templates/<name>/` for
 * templates. Separate namespaces mean no collision (a prototype named
 * "template-foo" and a template "foo" used to share a folder), and a
 * prototype may not use a name the CLI owns (`showcase` would be replaced by
 * `protoyard showcase`).
 */
export function artifactDir(
  ctx: CommandContext,
  entry: Pick<RegistryEntry, 'kind' | 'slug'>
): string {
  if (entry.kind === 'template') {
    return childPath(join(ctx.paths.artifacts, 'templates'), entry.slug);
  }
  if (RESERVED_ARTIFACT_NAMES.has(entry.slug)) {
    throw new CliError(
      'usage',
      `The slug "${entry.slug}" collides with a folder the CLI owns in artifacts/.`,
      {
        hint: `Rename the prototype (e.g. "${entry.slug}-app"); ${[...RESERVED_ARTIFACT_NAMES].join(', ')} are reserved.`,
      }
    );
  }
  return childPath(ctx.paths.artifacts, entry.slug);
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
    build?: {
      base?: string;
      includeDevtools?: boolean;
      offline?: boolean;
      frameWhenEmbedded?: boolean;
      review?: { enabled?: boolean; adapter?: 'local' | 'cloudflare' | 'http' | 'artifact' };
    };
  };
  const base = normalizeBase(options.base, manifestRaw.build?.base ?? './');
  const includeDevtools = options.includeDevtools ?? manifestRaw.build?.includeDevtools ?? false;
  const frameWhenEmbedded =
    options.frameWhenEmbedded ?? manifestRaw.build?.frameWhenEmbedded ?? false;
  const reviewConfig = resolveReviewBuild(manifestRaw.build?.review);
  const reviewEnabled = options.review
    ? true
    : process.env.PROTOYARD_REVIEW === undefined || process.env.PROTOYARD_REVIEW === ''
      ? reviewConfig.enabled
      : ['1', 'true', 'yes', 'on'].includes(process.env.PROTOYARD_REVIEW.trim().toLowerCase())
        ? true
        : ['0', 'false', 'no', 'off'].includes(process.env.PROTOYARD_REVIEW.trim().toLowerCase())
          ? false
          : reviewConfig.enabled;
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
    offline: options.offline === true,
    ...(options.storageNamespace ? { storageNamespace: options.storageNamespace } : {}),
    ...(options.frameWhenEmbedded ? { frameWhenEmbedded: true } : {}),
    ...(options.avatarBase ? { avatarBase: options.avatarBase } : {}),
    ...(options.avatarSizes ? { avatarSizes: options.avatarSizes } : {}),
    ...(options.review ? { review: options.review } : {}),
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

  // Reads and then deletes dist/.vite/manifest.json, before anything is digested.
  const bundle = await analyzeBundle(outDir);
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
      // Resolved from the prototype first: those are the versions its build used.
      core: workspacePackageVersion(ctx.root, 'core', [dir]),
      runtime: workspacePackageVersion(ctx.root, 'runtime', [dir]),
      rendererSvelte: workspacePackageVersion(ctx.root, 'renderer-svelte', [dir]),
      vite: viteVersion,
    },
    node: process.versions.node,
    offline: await readOfflineRecord(ctx.root, outDir),
    frameWhenEmbedded,
    review: { enabled: reviewEnabled, adapter: options.review?.adapter ?? reviewConfig.adapter },
    ...(bundle ? { bundle } : {}),
  };
  const wantsOffline = options.offline === true || manifestRaw.build?.offline === true;
  if (wantsOffline && manifest.offline === false) {
    throw new CliError(
      'validation',
      `${entry.slug} was built for offline use but has no service worker.`,
      {
        hint: 'The renderer did not emit dist/sw.js: check that the prototype uses defineProtoyardConfig from @protoyard/renderer-svelte/vite.',
      }
    );
  }
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
