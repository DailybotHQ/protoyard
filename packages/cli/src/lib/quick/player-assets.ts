import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { type FileDigest, sha256File } from '../checksum.ts';
import { CliError } from '../output.ts';
import { childPath } from '../paths.ts';
import { findInstalledPackage, protoyardPackageDir, readPackageJson } from '../workspace.ts';
import { quickPlayerDir } from './paths.ts';

/**
 * The prebuilt `@protoyard/player` for `protoyard quick` (ADR-031): found in
 * the installed package or this workspace, checked file by file against the
 * sha256 manifest the player ships, and copied (no Vite, no install) into an
 * exploration or a shared per-version folder. This module never starts a
 * process; the one build (a never-built packages/player in the monorepo)
 * lives in `player-build.ts`.
 *
 * Contract with the player package: its built app folder holds `index.html`
 * and `protoyard-player-assets.json` (written by `createPlayerAssetsManifest`
 * after `vite build`). The folder is `dist/app/`, or `dist/` for builds made
 * before the app moved out of the way of `dist/embed/`.
 */

export const PLAYER_ASSETS_MANIFEST = 'protoyard-player-assets.json';
export const PLAYER_ASSETS_FORMAT = 'protoyard.player-assets';
export const PLAYER_PACKAGE = '@protoyard/player';
/** App folders inside the package, in preference order. */
const APP_DIRS = ['dist/app', 'dist'];
const MAX_FILES = 5_000;

const SafePath = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes('\0') &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'must be a relative POSIX path inside the player'
  );

export const PlayerAssetsManifestSchema = z
  .object({
    format: z.literal(PLAYER_ASSETS_FORMAT),
    version: z.literal(1),
    /** The `@protoyard/player` version these files belong to. */
    player: z.string().min(1).max(64),
    files: z
      .array(
        z
          .object({
            path: SafePath,
            size: z.number().int().nonnegative(),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict()
      )
      .min(1)
      .max(MAX_FILES),
  })
  .strict()
  .refine((m) => m.files.some((f) => f.path === 'index.html'), 'the player has no index.html')
  .refine(
    (m) => new Set(m.files.map((f) => f.path)).size === m.files.length,
    'a file is listed twice'
  );

export type PlayerAssetsManifest = z.infer<typeof PlayerAssetsManifestSchema>;

export interface PlayerAssets {
  /** The app folder: index.html, chunks and the manifest. */
  dir: string;
  /** The `@protoyard/player` package folder. */
  packageDir: string;
  version: string;
  manifest: PlayerAssetsManifest;
  /** How it was found: the CLI's own dependency, the workspace's install, or this repository. */
  source: 'installed' | 'workspace' | 'repository';
}

/** Every entry under `root` (POSIX paths); symlinks and other non-files are reported apart. */
function walk(root: string): { files: string[]; odd: string[] } {
  const files: string[] = [];
  const odd: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (entry.isSymbolicLink()) odd.push(rel);
      else if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(rel);
      else odd.push(rel);
    }
  };
  visit(root);
  return { files: files.sort(), odd: odd.sort() };
}

/**
 * Writes the player's sha256 manifest for a built app folder (the player's
 * build step calls this right after `vite build`). Refuses symlinks.
 */
export async function createPlayerAssetsManifest(
  appDir: string,
  player: string
): Promise<PlayerAssetsManifest> {
  const { files, odd } = walk(appDir);
  if (odd.length > 0) {
    throw new CliError(
      'validation',
      `The player build has links or special files: ${odd.slice(0, 5).join(', ')}.`
    );
  }
  const listed: FileDigest[] = [];
  for (const path of files.filter((f) => f !== PLAYER_ASSETS_MANIFEST)) {
    const full = join(appDir, ...path.split('/'));
    listed.push({ path, size: lstatSync(full).size, sha256: await sha256File(full) });
  }
  const manifest = PlayerAssetsManifestSchema.parse({
    format: PLAYER_ASSETS_FORMAT,
    version: 1,
    player,
    files: listed,
  });
  await writeFile(join(appDir, PLAYER_ASSETS_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Reads and validates a manifest; problems become a `validation` CliError. */
export function readPlayerAssetsManifest(appDir: string): PlayerAssetsManifest {
  const path = join(appDir, PLAYER_ASSETS_MANIFEST);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new CliError(
      'validation',
      `The player has no readable ${PLAYER_ASSETS_MANIFEST} in ${appDir}.`,
      {
        hint: 'Use a released @protoyard/player, or rebuild it (`pnpm --filter @protoyard/player build`).',
      }
    );
  }
  const parsed = PlayerAssetsManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError(
      'validation',
      `${path} is not a valid player manifest: ${parsed.error.issues[0]?.message}.`
    );
  }
  return parsed.data;
}

/**
 * Checks `dir` holds exactly the manifest's files with their sizes and
 * sha256: nothing changed, missing, unlisted, linked or special. Throws a
 * `validation` CliError naming up to 10 problems.
 */
export async function verifyPlayerAssets(
  dir: string,
  manifest: PlayerAssetsManifest
): Promise<void> {
  const problems: string[] = [];
  const { files, odd } = walk(dir);
  for (const path of odd) problems.push(`${path}: a link or special file`);
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const path of files) {
    if (path !== PLAYER_ASSETS_MANIFEST && !listed.has(path))
      problems.push(`${path}: not in the manifest`);
  }
  const present = new Set(files);
  for (const file of manifest.files) {
    if (!present.has(file.path)) {
      problems.push(`${file.path}: missing`);
      continue;
    }
    const full = join(dir, ...file.path.split('/'));
    if (lstatSync(full).size !== file.size || (await sha256File(full)) !== file.sha256) {
      problems.push(`${file.path}: changed`);
    }
  }
  if (problems.length > 0) {
    throw new CliError(
      'validation',
      `The prebuilt player in ${dir} does not match its manifest (${problems.length} problem${problems.length === 1 ? '' : 's'}): ${problems.slice(0, 10).join('; ')}.`,
      {
        hint: 'Reinstall @protoyard/player, or rebuild it; Protoyard never runs a player that fails this check.',
      }
    );
  }
}

/** The CLI's own `@protoyard/player` (a portable CLI depends on it), via ESM resolution. */
function cliPlayerPackage(): string | null {
  let entry: string;
  try {
    entry = fileURLToPath(import.meta.resolve(`${PLAYER_PACKAGE}/embed`));
  } catch {
    return null;
  }
  for (let dir = dirname(entry); ; dir = dirname(dir)) {
    if (readPackageJson(join(dir, 'package.json'))?.name === PLAYER_PACKAGE) return dir;
    if (dirname(dir) === dir) return null;
  }
}

export interface LocatePlayerOptions {
  /** The workspace root, or null outside a workspace. */
  workspaceRoot: string | null;
  /** Test seam: replaces the CLI's own ESM resolution of @protoyard/player. */
  resolveInstalled?: () => string | null;
}

/**
 * Finds the prebuilt player: the CLI's own dependency first (so a portable
 * CLI brings its matching player), then the workspace's install, then this
 * repository's `packages/player`. The app folder must hold index.html and a
 * valid manifest for the package's own version.
 */
export function locatePlayerAssets(options: LocatePlayerOptions): PlayerAssets {
  const candidates: { dir: string; source: PlayerAssets['source'] }[] = [];
  const installed = (options.resolveInstalled ?? cliPlayerPackage)();
  if (installed) candidates.push({ dir: installed, source: 'installed' });
  if (options.workspaceRoot) {
    const fromWorkspace = findInstalledPackage(PLAYER_PACKAGE, options.workspaceRoot);
    if (fromWorkspace) candidates.push({ dir: fromWorkspace, source: 'workspace' });
    const repository = protoyardPackageDir(options.workspaceRoot, 'player');
    if (repository) candidates.push({ dir: repository, source: 'repository' });
  }
  const seen = new Set<string>();
  let unbuilt: string | null = null;
  for (const candidate of candidates) {
    const real = realpathSync(candidate.dir);
    if (seen.has(real)) continue;
    seen.add(real);
    const version = readPackageJson(join(candidate.dir, 'package.json'))?.version;
    if (!version) continue;
    for (const appDir of APP_DIRS) {
      const dir = join(candidate.dir, ...appDir.split('/'));
      if (!existsSync(join(dir, 'index.html'))) continue;
      if (!existsSync(join(dir, PLAYER_ASSETS_MANIFEST))) {
        unbuilt ??= dir;
        continue;
      }
      const manifest = readPlayerAssetsManifest(dir);
      if (manifest.player !== version) {
        throw new CliError(
          'validation',
          `The player in ${dir} is ${manifest.player}, but its package is ${version}.`,
          { hint: 'Rebuild or reinstall @protoyard/player so the files match the package version.' }
        );
      }
      return { dir, packageDir: candidate.dir, version, manifest, source: candidate.source };
    }
  }
  throw new CliError(
    'not_found',
    unbuilt
      ? `The player build in ${unbuilt} has no ${PLAYER_ASSETS_MANIFEST}.`
      : 'No prebuilt @protoyard/player was found.',
    {
      hint: unbuilt
        ? 'Rebuild the player so it writes its asset manifest, or install a released @protoyard/player.'
        : 'Install @protoyard/player (it comes with the protoyard CLI), or build packages/player in this repository.',
    }
  );
}

export type PlayerTarget =
  /** `<zone>/_player/<version>/`, shared by every exploration of the zone. */
  | { kind: 'shared'; zone: string }
  /** `<exploration>/player/`, a self-contained copy. */
  | { kind: 'exploration'; dir: string };

export interface MaterializedPlayer {
  dir: string;
  version: string;
  /** True when a verified copy was already there (nothing was written). */
  reused: boolean;
  /** True when a copy that failed verification was replaced. */
  repaired: boolean;
  files: number;
}

/** Where a target puts the player. */
export function playerTargetDir(target: PlayerTarget, version: string): string {
  return target.kind === 'shared'
    ? quickPlayerDir(target.zone, version)
    : childPath(target.dir, 'player');
}

/** True when the copy's own manifest lists exactly the source manifest's files and digests. */
function sameManifest(dir: string, source: PlayerAssetsManifest): boolean {
  try {
    const own = readPlayerAssetsManifest(dir);
    return (
      own.player === source.player && JSON.stringify(own.files) === JSON.stringify(source.files)
    );
  } catch {
    return false;
  }
}

/**
 * Verifies the source, then copies exactly the manifest's files into the
 * target by staging next to it, verifying the copy, and renaming it into
 * place. A copy already there is reused only when it verifies against the
 * CURRENT source manifest and carries that same manifest (same file list and
 * sha256); otherwise it is replaced, so a player rebuilt under the same
 * version never leaves the shared `_player/<version>/` behind. No build and
 * no install run.
 */
export async function materializePlayer(
  assets: PlayerAssets,
  target: PlayerTarget
): Promise<MaterializedPlayer> {
  await verifyPlayerAssets(assets.dir, assets.manifest);
  const destination = playerTargetDir(target, assets.version);
  let repaired = false;
  if (existsSync(destination)) {
    try {
      await verifyPlayerAssets(destination, assets.manifest);
      if (!sameManifest(destination, assets.manifest)) throw new Error('stale manifest');
      return {
        dir: destination,
        version: assets.version,
        reused: true,
        repaired: false,
        files: assets.manifest.files.length,
      };
    } catch {
      repaired = true;
    }
  }
  await mkdir(dirname(destination), { recursive: true });
  const stage = await mkdtemp(join(dirname(destination), `.player-${assets.version}-`));
  try {
    for (const file of assets.manifest.files) {
      const to = join(stage, ...file.path.split('/'));
      await mkdir(dirname(to), { recursive: true });
      await copyFile(join(assets.dir, ...file.path.split('/')), to);
    }
    await copyFile(join(assets.dir, PLAYER_ASSETS_MANIFEST), join(stage, PLAYER_ASSETS_MANIFEST));
    await verifyPlayerAssets(stage, assets.manifest);
    if (repaired) await rm(destination, { recursive: true, force: true });
    await rename(stage, destination);
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  return {
    dir: destination,
    version: assets.version,
    reused: false,
    repaired,
    files: assets.manifest.files.length,
  };
}

/** The command that rebuilds the player in this repository. */
export const PLAYER_BUILD_COMMAND = 'pnpm --filter @protoyard/player build';
/** Build inputs of the player app, relative to its package folder. */
const PLAYER_SOURCE_INPUTS = ['src', 'index.html', 'vite.config.ts'];
const MAX_SOURCE_ENTRIES = 20_000;

/** The newest regular file under the inputs (symlinks skipped), or null. */
function newestSource(packageDir: string): { path: string; mtimeMs: number } | null {
  let newest: { path: string; mtimeMs: number } | null = null;
  let seen = 0;
  const consider = (full: string) => {
    const info = lstatSync(full, { throwIfNoEntry: false });
    if (!info || info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const entry of readdirSync(full)) {
        if (++seen > MAX_SOURCE_ENTRIES) return;
        consider(join(full, entry));
      }
    } else if (info.isFile() && (newest === null || info.mtimeMs > newest.mtimeMs)) {
      newest = { path: full, mtimeMs: info.mtimeMs };
    }
  };
  for (const input of PLAYER_SOURCE_INPUTS) consider(join(packageDir, input));
  return newest;
}

/**
 * In the Protoyard monorepo only (the player found is this workspace's own
 * `packages/player`, with its sources), a warning when a source file is newer
 * than the built app's manifest: `quick` would copy a player built before
 * that change. Returns null when the build is fresh, when the player is an
 * installed release, or outside a workspace. Never throws.
 */
export function stalePlayerBuildWarning(
  assets: PlayerAssets,
  workspaceRoot: string | null
): string | null {
  if (!workspaceRoot) return null;
  try {
    const local = join(workspaceRoot, 'packages', 'player');
    if (!existsSync(join(local, 'src')) || !existsSync(join(local, 'package.json'))) return null;
    if (realpathSync(assets.packageDir) !== realpathSync(local)) return null;
    const manifest = join(assets.dir, PLAYER_ASSETS_MANIFEST);
    const builtAt = statSync(manifest).mtimeMs;
    const newest = newestSource(local);
    if (!newest || newest.mtimeMs <= builtAt) return null;
    const rel = (path: string) => relative(workspaceRoot, path).split(sep).join('/');
    return `The prebuilt player in ${rel(assets.dir)} is older than its source (${rel(newest.path)} changed after the build), so this exploration runs the old player. Rebuild it with \`${PLAYER_BUILD_COMMAND}\`, then run quick again.`;
  } catch {
    return null;
  }
}
