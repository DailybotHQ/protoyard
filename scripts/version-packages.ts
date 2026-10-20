/**
 * `pnpm version-packages` — apply pending changesets, then sync the root version.
 *
 * Every public package versions in lockstep through one Changesets `fixed`
 * group (.changeset/config.json, ADR-028). `changeset version` bumps them and
 * writes their CHANGELOG.md files; this script then checks that the public
 * packages (packages/*, apps/gallery; never `private`) share one version and
 * writes it to the root package.json, which release.yml compares with the
 * `v*` tag. The root CHANGELOG.md is hand-curated and never touched here.
 *
 *   pnpm version-packages [--check] [--root <dir>]
 *
 * `--check` skips `changeset version` and the write: it only verifies that the
 * public packages and the root agree. Exit codes: 0 in sync, 1 versions
 * disagree or `changeset version` failed, 2 usage.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findCandidates } from './check-packages.ts';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

export interface PackageVersion {
  name: string;
  path: string;
  version: string;
}

export interface LockstepState {
  /** The shared version, or null when the public packages disagree. */
  version: string | null;
  rootVersion: string;
  packages: PackageVersion[];
}

export function lockstepState(root: string = REPO): LockstepState {
  const packages = findCandidates(root).map((c) => ({
    name: String(c.manifest.name),
    path: relative(root, c.dir),
    version: String(c.manifest.version ?? ''),
  }));
  const versions = new Set(packages.map((p) => p.version));
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version?: string;
  };
  return {
    version: versions.size === 1 ? ([...versions][0] ?? null) : null,
    rootVersion: rootManifest.version ?? '',
    packages,
  };
}

/**
 * Sets the root package.json `version`, keeping the file's formatting (only
 * the top-level version line changes). Returns true when the file changed.
 */
export function syncRootVersion(root: string, version: string): boolean {
  const path = join(root, 'package.json');
  const text = readFileSync(path, 'utf8');
  const current = (JSON.parse(text) as { version?: string }).version;
  if (current === version) return false;
  const line = /^( {2}"version": ")[^"]*(",?)$/m;
  const next = line.test(text)
    ? text.replace(line, (_, start: string, end: string) => `${start}${version}${end}`)
    : `${JSON.stringify({ ...JSON.parse(text), version }, null, 2)}\n`;
  if ((JSON.parse(next) as { version?: string }).version !== version) {
    throw new Error(`Could not set the version in ${path}.`);
  }
  writeFileSync(path, next);
  return true;
}

/** Runs the repository's own `changeset version` in `root`. */
export function runChangesetVersion(root: string): number {
  const bin = createRequire(join(REPO, 'package.json')).resolve('@changesets/cli/bin.js');
  const result = spawnSync(process.execPath, [bin, 'version'], { cwd: root, stdio: 'inherit' });
  return result.status ?? 1;
}

function describe(state: LockstepState): string {
  return state.packages.map((p) => `  ${p.name}@${p.version} (${p.path})`).join('\n');
}

class UsageError extends Error {}

export function parseArgs(argv: string[]): { check: boolean; root: string } {
  const options = { check: false, root: REPO };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--root') {
      const value = argv[++i];
      if (!value) throw new UsageError('--root needs a directory');
      options.root = resolve(value);
    } else throw new UsageError(`Unknown option ${arg}`);
  }
  return options;
}

/** The whole command; returns the exit code. */
export function versionPackages(options: { check: boolean; root: string }): number {
  if (!options.check) {
    const status = runChangesetVersion(options.root);
    if (status !== 0) {
      console.error(`version-packages: changeset version exited ${status}.`);
      return 1;
    }
  }
  const state = lockstepState(options.root);
  if (state.version === null) {
    console.error(
      `version-packages: the public packages do not share one version:\n${describe(state)}\nEvery public package must be in the fixed group of .changeset/config.json.`
    );
    return 1;
  }
  if (options.check) {
    if (state.rootVersion !== state.version) {
      console.error(
        `version-packages: root package.json is ${state.rootVersion}, the packages are ${state.version}. Run \`pnpm version-packages\`.`
      );
      return 1;
    }
    console.log(`${state.packages.length} public packages and the root are at ${state.version}.`);
    return 0;
  }
  const changed = syncRootVersion(options.root, state.version);
  console.log(
    `${state.packages.length} public packages at ${state.version}; root package.json ${changed ? 'updated' : 'already in sync'}. Add the ${state.version} section to CHANGELOG.md before tagging v${state.version}.`
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = versionPackages(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`version-packages: ${error.message}`);
    process.exitCode = 2;
  }
}
