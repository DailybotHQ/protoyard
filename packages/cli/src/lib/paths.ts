import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CliError } from './output.ts';

/** Workspace-relative locations every command agrees on. */
export interface WorkspacePaths {
  root: string;
  prototypes: string;
  templates: string;
  /** Data-only product blueprints (`blueprints/*.json`) for the marketplace catalog. */
  blueprints: string;
  artifacts: string;
  /** Git-ignored generated state (`.protoyard/`). */
  state: string;
  registry: string;
  indexCache: string;
}

export function workspacePaths(root: string): WorkspacePaths {
  const state = join(root, '.protoyard');
  return {
    root,
    prototypes: join(root, 'prototypes'),
    templates: join(root, 'templates'),
    blueprints: join(root, 'blueprints'),
    artifacts: join(root, 'artifacts'),
    state,
    registry: join(state, 'registry.json'),
    indexCache: join(state, 'index-cache.json'),
  };
}

/**
 * Resolves the workspace root. An explicit `--root`/`PROTOYARD_ROOT` is used
 * as-is (benchmarks and tests point it at temp dirs); otherwise we walk up from
 * the working directory to the folder holding `pnpm-workspace.yaml`, so the CLI
 * works from inside a prototype folder too.
 */
export function resolveWorkspaceRoot(options: { root?: string; cwd?: string } = {}): string {
  const cwd = resolve(options.cwd ?? process.cwd());
  const explicit = options.root ?? process.env.PROTOYARD_ROOT;
  if (explicit) {
    const root = resolve(cwd, explicit);
    if (!existsSync(root)) {
      throw new CliError('not_found', `Workspace root does not exist: ${root}`, {
        hint: 'Pass an existing directory with --root or PROTOYARD_ROOT.',
      });
    }
    // Canonical path: symlinked temp dirs (/var → /private/var on macOS)
    // must not make "inside the workspace" checks disagree.
    return realpathSync(root);
  }
  let dir = cwd;
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return realpathSync(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new CliError('not_found', `No Protoyard workspace found from ${cwd}.`, {
    hint: 'Run inside the repository (it has pnpm-workspace.yaml) or pass --root <dir>.',
  });
}

/** macOS (APFS/HFS+ default) and Windows file systems are case-insensitive. */
export const CASE_INSENSITIVE_FS = process.platform === 'darwin' || process.platform === 'win32';

/**
 * Canonical form of a path: symlinks resolved and on-disk letter case
 * restored for the longest EXISTING ancestor (`realpathSync.native`), with
 * the not-yet-existing tail re-appended. Two spellings of the same folder
 * (`PROTOTYPES` vs `prototypes`, a symlink vs its target) canonicalize equal.
 */
export function canonicalPath(path: string): string {
  let current = resolve(path);
  const rest: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    rest.unshift(basename(current));
    current = parent;
  }
  let real = current;
  try {
    real = realpathSync.native(current);
  } catch {
    // unreadable ancestor: fall back to the lexical path
  }
  return rest.length > 0 ? join(real, ...rest) : real;
}

function comparable(path: string): string {
  return CASE_INSENSITIVE_FS ? path.toLowerCase() : path;
}

/**
 * True when `child` is `parent` itself or strictly inside it, comparing
 * canonical paths — so neither letter case nor symlinks can smuggle a path
 * past a containment check.
 */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(comparable(canonicalPath(parent)), comparable(canonicalPath(child)));
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

/** Same path after canonicalization (case-insensitive where the file system is). */
export function samePath(a: string, b: string): boolean {
  return comparable(canonicalPath(a)) === comparable(canonicalPath(b));
}

/**
 * Joins a single path segment under `base` and guarantees the result stays a
 * direct child. Slugs are already validated, but this is the second fence
 * against traversal (`..`, absolute paths, separators) for any caller.
 */
export function childPath(base: string, segment: string): string {
  if (!segment || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
    throw new CliError('unsafe_path', `Refusing unsafe path segment "${segment}".`);
  }
  const target = resolve(base, segment);
  if (dirname(target) !== resolve(base)) {
    throw new CliError('unsafe_path', `Refusing a path outside ${base}: "${segment}".`);
  }
  return target;
}

/**
 * Pulled and exported review comments live in their own folder, outside
 * artifacts/review/ (the page `review-index --publish` uploads as a site).
 */
export const REVIEW_COMMENTS_DIR = 'review-comments';

/** The pulled comments cache (`artifacts/review-comments/comments/<slug>.json`). */
export function commentsPath(paths: { artifacts: string }, slug: string): string {
  return childPath(join(paths.artifacts, REVIEW_COMMENTS_DIR, 'comments'), `${slug}.json`);
}

/** Workspace-relative POSIX path for display and registry entries. */
export function toPosixRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}
