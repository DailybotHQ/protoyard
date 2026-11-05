import { existsSync, globSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BLUEPRINTS_ROOT, TEMPLATES_ROOT } from '@protoyard/templates';
import { readWorkspaceTemplateGlobs } from './listing.ts';
import { CliError } from './output.ts';

/** Workspace-relative locations every command agrees on. */
export interface WorkspacePaths {
  root: string;
  prototypes: string;
  templates: string;
  /** Matched workspace-local templates; checked before the published catalog. */
  localTemplates: string[];
  /** Data-only product blueprints (`blueprints/*.json`) for the marketplace catalog. */
  blueprints: string;
  artifacts: string;
  /** Git-ignored generated state (`.protoyard/`). */
  state: string;
  registry: string;
  indexCache: string;
}

export type WorkspaceLayout = 'monorepo' | 'consumer';

type WorkspacePackage = {
  protoyard?: unknown;
  workspaces?: unknown;
};

function readWorkspacePackage(root: string): WorkspacePackage | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as WorkspacePackage) : null;
  } catch {
    return null;
  }
}

function hasProtoyardWorkspaceMarker(pkg: WorkspacePackage | null): boolean {
  if (!pkg) return false;
  if (typeof pkg.protoyard !== 'object' || pkg.protoyard === null || Array.isArray(pkg.protoyard))
    return false;
  return Object.hasOwn(pkg.protoyard, 'workspace');
}

function hasConsumerMarker(pkg: WorkspacePackage | null): boolean {
  if (!pkg) return false;
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces.length > 0;
  if (!pkg.workspaces || typeof pkg.workspaces !== 'object') return false;
  const packages = (pkg.workspaces as { packages?: unknown }).packages;
  return Array.isArray(packages) && packages.length > 0;
}

/** Returns the supported workspace layout at an already-resolved root. */
/**
 * Whether `text` holds a C0 control character, DEL, or a line or paragraph
 * separator (U+2028/2029 end a `//` comment in JavaScript source). Such a
 * character never belongs in a path Protoyard writes, quotes or accepts.
 */
export function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

export function workspaceLayout(root: string): WorkspaceLayout | null {
  const pkg = readWorkspacePackage(root);
  // Only the dedicated `protoyard.workspace` marker identifies a consumer.
  // Package manifests also use the `protoyard` field for build metadata.
  if (hasProtoyardWorkspaceMarker(pkg)) return 'consumer';
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) return 'monorepo';
  return hasConsumerMarker(pkg) ? 'consumer' : null;
}

export function workspacePaths(root: string): WorkspacePaths {
  const state = join(root, '.protoyard');
  const consumer = workspaceLayout(root) === 'consumer';
  const templates = consumer ? TEMPLATES_ROOT : join(root, 'templates');
  const blueprints = consumer ? BLUEPRINTS_ROOT : join(root, 'blueprints');
  const localTemplates = consumer ? localTemplateDirectories(root) : [];
  return {
    root,
    prototypes: join(root, 'prototypes'),
    templates,
    localTemplates,
    blueprints,
    artifacts: join(root, 'artifacts'),
    state,
    registry: join(state, 'registry.json'),
    indexCache: join(state, 'index-cache.json'),
  };
}

/** Resolves safe, workspace-local template directory globs without following symlinks. */
function localTemplateDirectories(root: string): string[] {
  let patterns: string[];
  try {
    patterns = readWorkspaceTemplateGlobs(root);
  } catch (error) {
    throw new CliError('validation', (error as Error).message);
  }
  const found = new Set<string>();
  for (const pattern of patterns) {
    const segments = pattern.split(/[\\/]/);
    if (
      isAbsolute(pattern) ||
      pattern.includes('\\') ||
      segments.some((segment) => segment === '..' || segment === '.') ||
      pattern.startsWith('!')
    ) {
      throw new CliError(
        'unsafe_path',
        `Refusing template glob "${pattern}": patterns must be relative to the workspace root and cannot traverse outside it.`
      );
    }
    let matches: string[];
    try {
      matches = globSync(pattern, { cwd: root });
    } catch (error) {
      throw new CliError(
        'validation',
        `Cannot read template glob "${pattern}": ${(error as Error).message}`
      );
    }
    for (const match of matches) {
      const dir = resolve(root, match);
      if (!isInside(root, dir)) continue;
      const parts = relative(root, dir).split(sep).filter(Boolean);
      let current = root;
      let safe = true;
      for (const part of parts) {
        current = join(current, part);
        try {
          if (lstatSync(current).isSymbolicLink()) {
            safe = false;
            break;
          }
        } catch {
          safe = false;
          break;
        }
      }
      if (safe && existsSync(join(dir, 'protoyard.json'))) found.add(dir);
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * Resolves the workspace root. An explicit `--root`/`PROTOYARD_ROOT` is used
 * as-is (benchmarks and tests point it at temp dirs); otherwise we walk up from
 * the working directory to the folder holding `pnpm-workspace.yaml` or a
 * consumer package.json with a Protoyard workspace/workspaces marker, so the CLI works
 * from inside a prototype folder too.
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
    if (workspaceLayout(dir)) return realpathSync(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new CliError('not_found', `No Protoyard workspace found from ${cwd}.`, {
    hint: 'Run inside a Protoyard workspace (pnpm-workspace.yaml or a marked package.json) or pass --root <dir>.',
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
