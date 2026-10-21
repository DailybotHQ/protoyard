import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import {
  AVATAR_DIR,
  AVATAR_IMAGE_SIZES,
  listAvatarFiles,
} from '@protoyard/renderer-svelte/avatars-plugin';
import { ARTIFACT_LIMITS, type ArtifactPackManifest, packArtifact } from '../lib/artifact-pack.ts';
import { buildPrototype, scanForForeignCode } from '../lib/build.ts';
import { digestDirectory } from '../lib/checksum.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { lanAddresses, untilSignal } from '../lib/network.ts';
import { CliError, formatBytes, mark, toCliError } from '../lib/output.ts';
import { BUILD_MARKER, guardOutputDir, SHOWCASE_MARKER } from '../lib/output-guard.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { parsePort } from '../lib/ports.ts';
import { resolvePackageBin } from '../lib/process.ts';
import {
  type PublishRunOptions,
  type PublishRunResult,
  publishDirectory,
} from '../lib/publish-run.ts';
import {
  buildIndex,
  type Registry,
  type RegistryEntry,
  templateDemoNamespace,
  writeJsonAtomic,
} from '../lib/registry.ts';
import {
  COMMENTS_REVIEW_BUILD,
  parseCommentsOption,
  type ReviewWorkerFiles,
  writeReviewWorker,
} from '../lib/review-worker.ts';
import { serveStatic } from '../lib/static-server.ts';
import { normalizeBase } from '../lib/vite.ts';
import type { CommandContext } from '../lib/workspace.ts';
import { protoyardPackageDir } from '../lib/workspace.ts';
import { createProvider } from '../publish/index.ts';
import type { PublishProvider } from '../publish/types.ts';
import { commentsSetupLines } from './publish.ts';
import { requireGalleryDir } from './serve.ts';

/**
 * `protoyard showcase` builds ONE static site: the gallery (with its
 * marketplace) plus a live, read-only demo of every prototype at
 * `<base>p/<slug>/app/` and of every template at `<base>t/<name>/app/`
 * (`--no-templates` leaves templates out), and the prebuilt player at
 * `<base>player/` embedded by the blueprint playground at `<base>play/`. The gallery learns which builds are
 * bundled from an `embedded` flag in a showcase-only copy of the registry, so
 * the marketplace's "Try it", hosted previews and "Open" links work with no
 * control server.
 *
 * Template demos use the same `template-demo-<name>` storage namespace as
 * `protoyard dev <template>`, so visitors' demo data never shares the
 * template's authoring namespace. Each build is still isolated (its own Vite
 * process and config) and must pass the same isolation check as `export`.
 * Blueprints have no app until they are generated, so they are not bundled.
 *
 * Avatar images are shared: every app is built with PROTOYARD_AVATAR_BASE at
 * `<base>avatars/` (so no app emits its own copy) and the library is copied
 * once to the site root, about 0.5 MB in total instead of 0.5 MB per app.
 */

export interface ShowcaseTarget {
  kind: RegistryEntry['kind'];
  slug: string;
  /** Site-relative app path, e.g. `p/crm-demo/app/`. */
  appPath: string;
  /** Site-relative marketplace page where the demo is tried, e.g. `marketplace/template/blank/`. */
  marketplacePath?: string;
  /** Storage namespace baked into the build (templates: `template-demo-<name>`). */
  storageNamespace?: string;
  ok: boolean;
  bytes?: number;
  durationMs: number;
  error?: string;
}

export function appPathFor(entry: Pick<RegistryEntry, 'kind' | 'slug'>): string {
  return `${entry.kind === 'template' ? 't' : 'p'}/${entry.slug}/app/`;
}

/** The marketplace detail page for an entry (apps/gallery/src/pages/marketplace). */
export function marketplacePathFor(entry: Pick<RegistryEntry, 'kind' | 'slug'>): string {
  return `marketplace/${entry.kind}/${entry.slug}/`;
}

export interface ShowcaseEntry {
  entry: RegistryEntry;
  appPath: string;
  marketplacePath: string;
  /** Set for template demos only; prototypes keep their own namespace. */
  storageNamespace?: string;
}

/**
 * What the showcase bundles: every prototype and, unless `templates` is
 * false, every template as a live demo in its demo namespace. Blueprints (and
 * any other kind) are skipped: they have no app to build.
 */
export function showcaseEntries(
  entries: readonly RegistryEntry[],
  options: { templates: boolean }
): ShowcaseEntry[] {
  return entries
    .filter((e) => e.kind === 'prototype' || (options.templates && e.kind === 'template'))
    .map((entry) => ({
      entry,
      appPath: appPathFor(entry),
      marketplacePath: marketplacePathFor(entry),
      ...(entry.kind === 'template' ? { storageNamespace: templateDemoNamespace(entry.slug) } : {}),
    }));
}

/** Selects showcase demos by slug while keeping the normal prototype/template rules. */
export function selectShowcaseEntries(
  entries: readonly RegistryEntry[],
  options: { templates: boolean; slugs?: readonly string[] }
): ShowcaseEntry[] {
  const candidates = showcaseEntries(entries, { templates: options.templates });
  if (!options.slugs) return candidates;
  const wanted = new Set(options.slugs);
  const found = new Set(
    candidates.filter((item) => wanted.has(item.entry.slug)).map((item) => item.entry.slug)
  );
  const missing = options.slugs.filter((slug) => !found.has(slug));
  if (missing.length > 0) {
    throw new CliError(
      'not_found',
      `No showcase prototype or template for: ${missing.join(', ')}.`,
      {
        hint: 'Check the slugs with `pnpm protoyard list --kind prototype` or omit --slugs.',
      }
    );
  }
  return candidates.filter((item) => wanted.has(item.entry.slug));
}

/** The one avatar folder every showcase app points at: `<base>avatars/`. */
export function showcaseAvatarBase(base: string, appPath?: string): string {
  if (base === './' && appPath) return `${posix.relative(appPath, AVATAR_DIR)}/`;
  return `${base}${AVATAR_DIR}/`;
}

/** Refuses the exact artifact-version file count before writing any pack. */
export function assertShowcaseArtifactLimit(fileCount: number, slugs?: readonly string[]): void {
  if (fileCount <= ARTIFACT_LIMITS.filesPerVersion) return;
  const selection = slugs?.length ? ` for selection ${slugs.join(', ')}` : '';
  throw new CliError(
    'validation',
    `Showcase artifact${selection} has ${fileCount} files; one Artifact version allows at most ${ARTIFACT_LIMITS.filesPerVersion}.`,
    {
      hint: 'Reduce the bundled demos with `--slugs prototype-a,prototype-b` and try again.',
    }
  );
}

export async function packShowcaseArtifact(
  distDir: string,
  outDir: string,
  options: { slugs?: readonly string[] } = {}
): Promise<ArtifactPackManifest> {
  const files = await digestDirectory(distDir);
  assertShowcaseArtifactLimit(files.length, options.slugs);
  const result = await packArtifact({
    distDir,
    outDir,
    slug: 'showcase',
    manifest: {
      id: 'protoyard.showcase',
      name: 'Protoyard showcase',
      description: 'A selected set of functional Protoyard prototype demos.',
      category: 'marketplace',
    },
    allowStaticPage: true,
  });
  if (!result.ok) {
    const versionLimit = result.issues.find((issue) => issue.path === '(version)');
    if (versionLimit?.reason.includes('file limit')) {
      const count = files.length;
      assertShowcaseArtifactLimit(count, options.slugs);
    }
    throw new CliError(
      'validation',
      `Showcase breaks ${result.issues.length} Claude artifact rule(s).`,
      { hint: result.issues.map((issue) => `${issue.path}: ${issue.reason}`).join('\n') }
    );
  }
  return result.manifest;
}

function parseShowcaseSlugs(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const slugs = value.split(',').map((slug) => slug.trim());
  if (slugs.some((slug) => slug.length === 0)) {
    throw new CliError('usage', '--slugs needs a comma-separated list of non-empty slugs.');
  }
  return [...new Set(slugs)];
}

/**
 * Copies the avatar library once into `siteDir/avatars/<size>/<id>.webp`
 * (the shared folder of `showcaseAvatarBase`). Returns what was written.
 */
export async function shareAvatars(
  siteDir: string,
  options: { assetsDir?: string } = {}
): Promise<{ path: string; files: number; bytes: number }> {
  const files = listAvatarFiles(AVATAR_IMAGE_SIZES, options.assetsDir);
  let bytes = 0;
  for (const file of files) {
    const target = join(siteDir, ...file.fileName.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file.source, target);
    bytes += (await stat(target)).size;
  }
  return { path: `${AVATAR_DIR}/`, files: files.length, bytes };
}

/** Do not upload a partial showcase; every selected app must have built cleanly. */
export function assertShowcasePublishable(targets: readonly ShowcaseTarget[]): void {
  const failed = targets.filter((target) => !target.ok);
  if (failed.length > 0) {
    throw new CliError(
      'failure',
      `${failed.length} of ${targets.length} showcase target(s) failed; refusing to publish.`
    );
  }
}

/** Publishes the already-built showcase without including its local ownership marker. */
export async function publishShowcaseDirectory(
  ctx: CommandContext,
  out: string,
  provider: PublishProvider,
  options: PublishRunOptions
): Promise<PublishRunResult> {
  const markerPath = join(out, SHOWCASE_MARKER);
  const marker = existsSync(markerPath) ? await readFile(markerPath, 'utf8') : undefined;
  await rm(markerPath, { force: true });
  try {
    return await publishDirectory(ctx, { slug: 'showcase', distDir: out }, provider, options);
  } finally {
    if (marker !== undefined) await writeFile(markerPath, marker, 'utf8');
  }
}

/** The registry the showcase gallery is built from: only successful builds are marked embedded. */
export function showcaseRegistry(registry: Registry, targets: readonly ShowcaseTarget[]): Registry {
  const embedded = new Map(
    targets.filter((t) => t.ok).map((t) => [`${t.kind}:${t.slug}`, t.appPath])
  );
  return {
    ...registry,
    entries: registry.entries.map((entry) => {
      const url = embedded.get(`${entry.kind}:${entry.slug}`);
      return url ? { ...entry, embedded: { url, scenarioLinks: true } } : entry;
    }),
  } as Registry;
}

function showcaseRegistryForSelection(
  registry: Registry,
  entries: readonly ShowcaseEntry[]
): Registry {
  const selected = new Set(entries.map(({ entry }) => `${entry.kind}:${entry.slug}`));
  return {
    ...registry,
    entries: registry.entries.filter((entry) => selected.has(`${entry.kind}:${entry.slug}`)),
  } as Registry;
}

/** Astro emits `./` assets as `/./...`; normalize those URLs for an Artifact page. */
export function rewriteAstroRelativeBase(value: string): string {
  return value.replaceAll('/./', './');
}

async function normalizeShowcaseRelativeAssets(distDir: string): Promise<void> {
  const textExtensions = /\.(?:css|html|js|json|mjs|svg|txt)$/i;
  for (const file of await digestDirectory(distDir)) {
    if (!textExtensions.test(file.path)) continue;
    const path = join(distDir, file.path);
    const content = await readFile(path, 'utf8');
    const normalized = rewriteAstroRelativeBase(content);
    if (normalized !== content) await writeFile(path, normalized, 'utf8');
  }
}

/** Same allow-list as build outputs; an existing site is only replaced when it is ours. */
function resolveShowcaseOut(
  ctx: CommandContext,
  out: string | undefined,
  allowExternal: boolean
): string {
  return guardOutputDir({
    root: ctx.root,
    paths: ctx.paths,
    requested: out ?? join('artifacts', 'showcase'),
    marker: SHOWCASE_MARKER,
    allowExternal,
  });
}

/**
 * The public origin the gallery uses for canonical links, Open Graph images
 * and the sitemap. Only an https origin (or http on localhost) with no path,
 * query or hash: the path part belongs to --base.
 */
export function parseShowcaseSite(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CliError(
      'usage',
      `--site must be an absolute URL such as https://protoyard.app (got "${value}").`
    );
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new CliError('usage', '--site must use https:// (http:// only for localhost).');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new CliError(
      'usage',
      '--site takes an origin only, such as https://protoyard.app; use --base for a sub-path.'
    );
  }
  return url.origin;
}

function buildGallery(
  ctx: CommandContext,
  outDir: string,
  registryPath: string,
  base: string,
  quiet: boolean,
  site?: string
) {
  const galleryDir = requireGalleryDir(ctx.root).dir;
  const astro = resolvePackageBin('astro', 'astro', [galleryDir, ctx.root]);
  if (!astro)
    throw new CliError('not_found', 'Astro is not installed.', { hint: 'Run `pnpm install`.' });
  return new Promise<{ code: number; log: string }>((resolvePromise) => {
    let log = '';
    const child = spawn(process.execPath, [astro, 'build', '--outDir', outDir], {
      cwd: galleryDir,
      env: {
        ...process.env,
        PROTOYARD_REGISTRY: registryPath,
        GALLERY_BASE: base,
        ...(site ? { GALLERY_SITE: site } : {}),
        PROTOYARD_SHOWCASE: '1',
        // Own caches: a concurrent regular gallery build must not share them.
        PROTOYARD_GALLERY_CACHE_DIR: join(ctx.paths.artifacts, 'showcase-builds', '.cache'),
      },
      shell: false,
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    const collect = (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-8000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (error) => resolvePromise({ code: 127, log: error.message }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, log }));
  });
}

/** Builds the standalone player into an isolated directory for the showcase. */
export function resolveShowcasePlayerDir(root: string): string {
  const playerDir = protoyardPackageDir(root, 'player');
  if (!playerDir) {
    throw new CliError('not_found', '@protoyard/player is not installed in this workspace.', {
      hint: 'Install @protoyard/player in the workspace, then try again.',
    });
  }
  return playerDir;
}

function buildPlayer(ctx: CommandContext, outDir: string, quiet: boolean) {
  const playerDir = resolveShowcasePlayerDir(ctx.root);
  const vite = resolvePackageBin('vite', 'vite', [playerDir, ctx.root]);
  if (!vite)
    throw new CliError('not_found', 'Vite is not installed.', { hint: 'Run `pnpm install`.' });
  return new Promise<{ code: number; log: string }>((resolvePromise) => {
    let log = '';
    const child = spawn(process.execPath, [vite, 'build', '--outDir', outDir], {
      cwd: playerDir,
      env: { ...process.env },
      shell: false,
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    const collect = (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-8000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (error) => resolvePromise({ code: 127, log: error.message }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, log }));
  });
}

/** Copies the built player and all of its runtime chunks under `<site>/player/`. */
export async function copyPlayerAssets(
  playerDist: string,
  siteDir: string,
  base = '/'
): Promise<void> {
  if (!existsSync(join(playerDist, 'index.html')))
    throw new CliError('validation', 'The player build did not emit index.html.');
  const playerHeadersPath = join(playerDist, '_headers');
  if (!existsSync(playerHeadersPath))
    throw new CliError('validation', 'The player build did not emit _headers.');
  const destination = join(siteDir, 'player');
  await mkdir(destination, { recursive: true });
  await cp(playerDist, destination, { recursive: true, force: true });
  const playerHeaders = await readFile(playerHeadersPath, 'utf8');
  const siteHeadersPath = join(siteDir, '_headers');
  const siteHeaders = existsSync(siteHeadersPath) ? await readFile(siteHeadersPath, 'utf8') : '';
  await writeFile(siteHeadersPath, mergePlayerHeaders(siteHeaders, playerHeaders, base), 'utf8');
}

/** Adds the player host rules to the Pages file at the artifact root. */
export function mergePlayerHeaders(siteHeaders: string, playerHeaders: string, base = '/'): string {
  const playerPath = `${base === '/' ? '' : base.replace(/\/$/, '')}/player/*`;
  const scoped = playerHeaders.replace(/^\/\*(\s*)$/gm, `${playerPath}$1`).trim();
  if (!scoped) throw new CliError('validation', 'The player _headers file is empty.');
  const existing = siteHeaders.trim();
  if (existing.includes(playerPath)) return `${existing}\n`;
  return `${[existing, scoped].filter(Boolean).join('\n\n')}\n`;
}

async function serve(dir: string, base: string, options: Record<string, unknown>) {
  const host = flag(options, 'host') ? '0.0.0.0' : '127.0.0.1';
  return serveStatic({
    dir,
    base,
    host,
    port: parsePort(opt(options, 'port'), 4500),
    strictPort: flag(options, 'strictPort'),
    spa: false,
  });
}

export const showcaseCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const target = opt(options, 'target') ?? 'site';
  const artifactTarget = target === 'artifact';
  const slugs = parseShowcaseSlugs(opt(options, 'slugs'));
  if (slugs && !artifactTarget) {
    throw new CliError('usage', '--slugs is only available with --target artifact.');
  }
  const requestedBase = opt(options, 'base');
  const base = normalizeBase(requestedBase ?? (artifactTarget ? './' : '/'));
  if (artifactTarget && base !== './') {
    throw new CliError('usage', 'Showcase artifact packs require the relative base "./".', {
      hint: 'Drop --base or pass --base ./ so every gallery link stays inside the artifact.',
    });
  }
  if (!artifactTarget && base === './') {
    throw new CliError(
      'usage',
      'A showcase needs an absolute --base such as "/" or "/protoyard/".'
    );
  }
  const site = parseShowcaseSite(opt(options, 'site') ?? process.env.PROTOYARD_SITE_URL);
  if (site && artifactTarget) {
    throw new CliError(
      'usage',
      '--site is only available for the showcase site, not an artifact pack.'
    );
  }
  const publishId = opt(options, 'publish');
  const requestedProject = opt(options, 'project');
  const branch = opt(options, 'branch');
  const dryRun = flag(options, 'dryRun');
  if (
    artifactTarget &&
    (publishId !== undefined || flag(options, 'serve') || flag(options, 'skipBuild'))
  ) {
    throw new CliError(
      'usage',
      'The artifact target only creates a local pack; remove --publish, --serve and --skip-build.'
    );
  }
  if (
    publishId === undefined &&
    (requestedProject !== undefined || branch !== undefined || dryRun)
  ) {
    throw new CliError('usage', '--project, --branch and --dry-run require --publish.');
  }
  if (publishId !== undefined && publishId !== 'cloudflare') {
    throw new CliError('usage', '--publish currently supports Cloudflare Pages only.');
  }
  // One comments worker at the site root serves every bundled demo (/api/comments/<slug>).
  const comments = parseCommentsOption(options.comments);
  if (comments && publishId !== 'cloudflare') {
    throw new CliError('usage', '--comments needs --publish cloudflare.', {
      hint: 'Example: pnpm protoyard showcase --publish cloudflare --comments --dry-run',
    });
  }
  const publishProvider = publishId === undefined ? undefined : createProvider(publishId, ctx.root);
  if (publishProvider && flag(options, 'skipBuild')) {
    throw new CliError('usage', 'Publishing requires a fresh showcase build; remove --skip-build.');
  }
  const allowExternal = flag(options, 'allowExternalOut');
  const out = resolveShowcaseOut(ctx, opt(options, 'out'), allowExternal);
  const quiet = ctx.out.options.json || ctx.out.options.quiet;

  if (flag(options, 'skipBuild')) {
    if (!existsSync(join(out, 'index.html'))) {
      throw new CliError('not_found', `No showcase at ${toPosixRelative(ctx.root, out)}.`, {
        hint: 'Run without --skip-build first.',
      });
    }
    if (!flag(options, 'serve'))
      throw new CliError('usage', '--skip-build only makes sense with --serve.');
    const server = await serve(out, base, options);
    return {
      data: { out: toPosixRelative(ctx.root, out), url: server.url, built: false },
      render: (o) =>
        o.always(`${mark(o.c, 'pass')} Serving the showcase at ${o.c.cyan(server.url)}`),
      keepAlive: untilSignal(() => server.close()),
    };
  }

  const { registry } = await buildIndex(ctx.paths);
  // Templates are bundled by default (the marketplace tries every product type);
  // `--no-templates` leaves them out. `--include-templates` is still accepted.
  const entries = selectShowcaseEntries(registry.entries, {
    templates: options.templates !== false,
    ...(slugs ? { slugs } : {}),
  });
  const includeDevtools = options.devtools !== false;
  const staging = `${out}.staging-${process.pid}`;
  const appsStaging = `${out}.apps-${process.pid}`;
  const playerOut = join(ctx.paths.artifacts, 'showcase-builds', `player-${process.pid}`);
  const artifactStaging = join(
    ctx.paths.artifacts,
    'showcase-builds',
    `artifact-pack-${process.pid}`
  );
  await rm(staging, { recursive: true, force: true });
  await rm(appsStaging, { recursive: true, force: true });
  await rm(artifactStaging, { recursive: true, force: true });

  const targets: ShowcaseTarget[] = [];
  let avatars: { path: string; files: number; bytes: number } | undefined;
  let artifactManifest: ArtifactPackManifest | undefined;
  let commentsFiles: ReviewWorkerFiles | undefined;
  try {
    // 1. Every demo, sequentially, each with its final public base.
    for (const { entry, appPath, marketplacePath, storageNamespace } of entries) {
      const started = performance.now();
      const where = { appPath, marketplacePath, ...(storageNamespace ? { storageNamespace } : {}) };
      ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)} → ${base}${appPath}`);
      try {
        const appOut = join(appsStaging, appPath);
        const result = await buildPrototype(ctx, entry, join(ctx.root, entry.path), {
          base: artifactTarget ? './' : `${base}${appPath}`,
          includeDevtools,
          out: appOut,
          allowExternalOut: allowExternal,
          // One shared copy at the site root (step 3), none inside the app.
          avatarBase: showcaseAvatarBase(base, artifactTarget ? appPath : undefined),
          ...(flag(options, 'offline') ? { offline: true } : {}),
          ...(storageNamespace ? { storageNamespace } : {}),
          ...(comments ? { review: COMMENTS_REVIEW_BUILD } : {}),
          manifestPath: join(
            ctx.paths.artifacts,
            'showcase-builds',
            `${entry.kind}-${entry.slug}.json`
          ),
        });
        const foreign = await scanForForeignCode(result.outDir, entry, registry.entries);
        if (foreign.length > 0) {
          throw new CliError(
            'validation',
            `bundle references ${foreign.map((f) => f.slug).join(', ')}`
          );
        }
        targets.push({
          kind: entry.kind,
          slug: entry.slug,
          ...where,
          ok: true,
          bytes: result.manifest.totalBytes,
          durationMs: Math.round(performance.now() - started),
        });
      } catch (error) {
        targets.push({
          kind: entry.kind,
          slug: entry.slug,
          ...where,
          ok: false,
          durationMs: Math.round(performance.now() - started),
          error: toCliError(error).message,
        });
      }
    }
    if (artifactTarget) assertShowcasePublishable(targets);

    // 2. The gallery, from a showcase registry that marks the bundled builds.
    // It lives in the workspace's .protoyard/ so thumbnail paths still resolve.
    const registryPath = join(ctx.paths.state, 'showcase-registry.json');
    const galleryRegistry = artifactTarget
      ? showcaseRegistryForSelection(registry, entries)
      : registry;
    await writeJsonAtomic(registryPath, showcaseRegistry(galleryRegistry, targets));
    ctx.out.info('Building the gallery…');
    const gallery = await buildGallery(ctx, staging, registryPath, base, quiet, site);
    if (gallery.code !== 0) {
      throw new CliError('failure', `Gallery build failed (exit ${gallery.code}).`, {
        hint: gallery.log.trim().split('\n').slice(-10).join('\n') || 'See the output above.',
      });
    }
    if (artifactTarget) await normalizeShowcaseRelativeAssets(staging);

    if (!artifactTarget) {
      await rm(playerOut, { recursive: true, force: true });
      ctx.out.info('Building the hosted player…');
      const player = await buildPlayer(ctx, playerOut, quiet);
      if (player.code !== 0) {
        throw new CliError('failure', `Player build failed (exit ${player.code}).`, {
          hint: player.log.trim().split('\n').slice(-10).join('\n') || 'See the output above.',
        });
      }
      await copyPlayerAssets(playerOut, staging, base);
      await rm(playerOut, { recursive: true, force: true });
    }

    // 3. Move each app under its detail page folder, then swap the site in.
    for (const target of targets.filter((t) => t.ok)) {
      const destination = join(staging, target.appPath);
      await mkdir(dirname(destination), { recursive: true });
      await rename(join(appsStaging, target.appPath), destination);
      // Build markers are local bookkeeping; they do not belong on a public site.
      await rm(join(destination, BUILD_MARKER), { force: true });
    }
    // The one shared avatar folder every app points at.
    if (targets.some((t) => t.ok)) avatars = await shareAvatars(staging);
    // The one comments worker, at the site root, before the site is digested.
    if (comments) commentsFiles = await writeReviewWorker(staging, comments);
    // The marker lets a later run replace this site, and only this site.
    const marker = {
      generator: '@protoyard/cli',
      builtAt: new Date().toISOString(),
    };
    await writeJsonAtomic(join(staging, SHOWCASE_MARKER), marker);
    if (artifactTarget) {
      // Local ownership markers are not part of the artifact page or its files.
      await rm(join(staging, SHOWCASE_MARKER), { force: true });
      try {
        await mkdir(dirname(artifactStaging), { recursive: true });
        artifactManifest = await packShowcaseArtifact(staging, artifactStaging, { slugs });
      } finally {
        await writeJsonAtomic(join(staging, SHOWCASE_MARKER), marker);
      }
    }
    // Re-check right before deleting: the guard ran minutes ago, before the builds.
    resolveShowcaseOut(ctx, out, allowExternal);
    await rm(out, { recursive: true, force: true });
    await mkdir(dirname(out), { recursive: true });
    await rename(staging, out);
    if (artifactTarget) {
      await rename(artifactStaging, join(out, 'artifact'));
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(appsStaging, { recursive: true, force: true });
    await rm(playerOut, { recursive: true, force: true });
    await rm(artifactStaging, { recursive: true, force: true });
  }

  const files = await digestDirectory(out);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const summary = {
    out: toPosixRelative(ctx.root, out),
    target,
    base,
    includeDevtools,
    files: files.length,
    totalBytes,
    ...(avatars ? { avatars } : {}),
    ...(commentsFiles
      ? {
          comments: {
            store: commentsFiles.store,
            binding: commentsFiles.binding,
            worker: { bytes: commentsFiles.worker.bytes, sha256: commentsFiles.worker.sha256 },
            routes: commentsFiles.routes.include,
          },
        }
      : {}),
    ...(artifactManifest
      ? {
          artifact: {
            outDir: toPosixRelative(ctx.root, join(out, 'artifact')),
            fileCount: artifactManifest.files.length + 1,
            files: artifactManifest.files.length,
            batches: artifactManifest.batches,
            buildSha256: artifactManifest.buildSha256,
            totalBytes: artifactManifest.totalBytes,
          },
        }
      : {}),
    targets,
  };
  await writeJsonAtomic(join(ctx.paths.artifacts, 'showcase-builds', 'showcase.json'), {
    ...summary,
    builtAt: new Date().toISOString(),
  });

  const failed = targets.filter((t) => !t.ok);
  let publication: PublishRunResult | undefined;
  if (publishProvider) {
    assertShowcasePublishable(targets);
    publication = await publishShowcaseDirectory(ctx, out, publishProvider, {
      dryRun,
      ...(requestedProject !== undefined ? { project: requestedProject } : {}),
      ...(branch !== undefined ? { branch } : {}),
      ...(comments ? { comments } : {}),
    });
  }
  const server = flag(options, 'serve') ? await serve(out, base, options) : null;
  const lan =
    server && flag(options, 'host')
      ? lanAddresses().map((ip) => `http://${ip}:${server.port}${base}`)
      : [];
  return {
    data: {
      ...summary,
      ...(server ? { url: server.url, lan } : {}),
      ...(publication
        ? {
            publication: {
              provider: publication.provider,
              target: publication.target,
              project: publication.project,
              dryRun: publication.dryRun,
              branch: publication.branch ?? null,
              distDir: publication.distDir,
              fileCount: publication.files,
              totalBytes: publication.bytes,
              ...(publication.comments ? { comments: publication.comments } : {}),
              ...(publication.kind === 'dry-run'
                ? {
                    command: publication.command,
                    commandLine: publication.commandLine,
                    toolAvailable: publication.toolAvailable,
                    toolHint: publication.toolHint,
                  }
                : { url: publication.url }),
            },
          }
        : {}),
    },
    ...(failed.length > 0
      ? {
          failure: new CliError(
            'failure',
            `${failed.length} of ${targets.length} demo build(s) failed; they are listed without a live demo.`
          ),
        }
      : {}),
    render(o) {
      const { c } = o;
      for (const t of targets) {
        o.always(
          `${mark(c, t.ok ? 'pass' : 'fail')} ${t.slug.padEnd(28)} ${t.ok ? c.dim(`${base}${t.appPath} · ${formatBytes(t.bytes ?? 0)}`) : c.red(t.error ?? '')}`
        );
      }
      o.always(
        `${mark(c, failed.length ? 'warn' : 'pass')} Showcase → ${c.cyan(summary.out)} (${files.length} files, ${formatBytes(totalBytes)}, base ${base}, DevTools ${includeDevtools ? 'included' : 'excluded'})`
      );
      if (artifactManifest) {
        o.always(
          `${mark(c, 'pass')} Artifact pack → ${c.cyan(toPosixRelative(ctx.root, join(out, 'artifact')))} (${artifactManifest.files.length + 1} files, ${artifactManifest.batches.length} publish batch${artifactManifest.batches.length === 1 ? '' : 'es'})`
        );
      }
      if (server) {
        o.always(`  Serving at ${c.cyan(server.url)}`);
        for (const url of lan) o.always(`  LAN: ${c.cyan(url)}`);
      } else {
        o.info(
          `  Try it: ${c.cyan(`pnpm protoyard showcase --skip-build --serve${base === '/' ? '' : ` --base ${base}`}`)}`
        );
        o.info(
          c.dim('  Upload the folder to any static host that serves it at the same base path.')
        );
      }
      if (publication?.kind === 'dry-run') {
        o.always(
          `${mark(c, 'pass')} Dry run: showcase ready (${publication.files} files, ${formatBytes(publication.bytes)}).`
        );
        if (publication.comments)
          for (const line of commentsSetupLines(c, publication.comments)) o.always(line);
        o.always(
          `Would run${publication.comments ? ' (after the one-time setup)' : ''}:\n  ${c.cyan(publication.commandLine ?? publication.command?.join(' ') ?? 'Wrangler command unavailable')}`
        );
        o.info(c.dim('Nothing was uploaded.'));
      } else if (publication?.kind === 'published') {
        o.always(
          `${mark(c, 'pass')} Published showcase to Cloudflare Pages (${publication.target}).`
        );
        if (publication.url) o.always(`  ${c.cyan(publication.url)}`);
        if (publication.comments)
          for (const line of commentsSetupLines(c, publication.comments)) o.info(line);
      }
    },
    ...(server ? { keepAlive: untilSignal(() => server.close()) } : {}),
  };
};
