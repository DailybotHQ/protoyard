import { CliError } from './output.ts';
import { run } from './process.ts';

/**
 * Maps a git diff's changed paths to the prototype slugs CI should build,
 * test and preview-deploy. Pure path rules (no git) live in
 * `mapChangedPaths`; the command layer runs `git diff --name-only`.
 *
 * Rules:
 * - `prototypes/<slug>/**` → that slug
 * - `packages/**`, `templates/**`, root workspace configs → every prototype
 * - docs / meta-only paths → none
 */

/** Minimal registry shape so unit tests do not need a full index. */
export interface AffectedRegistry {
  entries: ReadonlyArray<{ kind: string; slug: string }>;
}

export interface MapChangedPathsResult {
  /** Sorted unique prototype slugs to run. */
  slugs: string[];
  /** Why each slug was selected (one reason string per slug). */
  reasons: Record<string, string>;
  /** True when a shared path forced every prototype. */
  all: boolean;
  /**
   * Changed `prototypes/<name>/` folders that are not indexed prototypes
   * (deleted, renamed, or without a valid manifest). Never run.
   */
  skipped: string[];
}

export type PathEffect =
  | { effect: 'slug'; slug: string; reason: 'prototype' }
  | { effect: 'all'; reason: string }
  | { effect: 'none'; reason: string };

/** Root files that change how every prototype builds or is tested. */
const ROOT_CONFIG_EXACT = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'biome.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'playwright.config.ts',
  'playwright.config.js',
  '.npmrc',
  'turbo.json',
  'nx.json',
]);

const ROOT_CONFIG_PATTERNS: RegExp[] = [
  /^tsconfig\.[^/]+\.json$/,
  /^vitest\.config\.[^/]+$/,
  /^playwright\.config\.[^/]+$/,
];

/**
 * Git ref used as the left side of `ref...HEAD`. Rejects shell metacharacters,
 * option-looking values and range syntax so the argv stays data-only.
 */
const SAFE_GIT_REF = /^(?:HEAD(?:[~^][0-9]*)*(?:[\^][0-9]*)?|[A-Za-z0-9][A-Za-z0-9._/\-@~^{}]*)$/;

export function normalizeChangedPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export function assertSafeGitRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new CliError('usage', 'Missing --since <ref>.', {
      hint: 'Pass a git ref such as HEAD~1, main or origin/main.',
    });
  }
  if (trimmed.length > 256) {
    throw new CliError('usage', `Git ref is too long (${trimmed.length} characters).`);
  }
  if (trimmed.startsWith('-')) {
    throw new CliError('usage', `Git ref must not start with "-": ${trimmed}`);
  }
  if (trimmed.includes('..')) {
    throw new CliError('usage', `Git ref must not contain "..": ${trimmed}`, {
      hint: 'Pass a single ref; the command always diffs <ref>...HEAD.',
    });
  }
  if (!SAFE_GIT_REF.test(trimmed)) {
    throw new CliError('usage', `Unsafe or invalid git ref: ${trimmed}`, {
      hint: 'Use a branch, tag, SHA or HEAD~N with letters, digits, . _ / - @ ~ ^ { } only.',
    });
  }
  return trimmed;
}

/** Classifies one workspace-relative path under the affected rules. */
export function classifyPath(rawPath: string): PathEffect {
  const path = normalizeChangedPath(rawPath);
  if (!path) return { effect: 'none', reason: 'empty' };

  if (path === 'prototypes' || path.startsWith('prototypes/')) {
    const rest = path === 'prototypes' ? '' : path.slice('prototypes/'.length);
    const slug = rest.split('/')[0] ?? '';
    if (!slug || slug.startsWith('.') || slug.startsWith('_')) {
      return { effect: 'none', reason: 'prototypes-meta' };
    }
    return { effect: 'slug', slug, reason: 'prototype' };
  }

  if (path === 'packages' || path.startsWith('packages/')) {
    return { effect: 'all', reason: 'packages' };
  }
  if (path === 'templates' || path.startsWith('templates/')) {
    return { effect: 'all', reason: 'templates' };
  }

  if (!path.includes('/')) {
    if (ROOT_CONFIG_EXACT.has(path) || ROOT_CONFIG_PATTERNS.some((re) => re.test(path))) {
      return { effect: 'all', reason: 'root-config' };
    }
    if (isDocsOnlyFile(path)) {
      return { effect: 'none', reason: 'docs' };
    }
    // Unknown root file: treat as shared so CI does not silently skip builds.
    return { effect: 'all', reason: 'root-shared' };
  }

  if (isDocsOnlyPath(path)) {
    return { effect: 'none', reason: 'docs' };
  }

  // Other nested paths (apps/, scripts/, tests/, .github/, …) do not select
  // prototype build targets on their own.
  return { effect: 'none', reason: 'unrelated' };
}

function isDocsOnlyFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return true;
  if (lower === 'license' || lower.startsWith('license.')) return true;
  if (lower === 'changelog' || lower.startsWith('changelog.')) return true;
  if (lower === 'authors' || lower === 'contributors' || lower === 'codeowners') return true;
  if (lower === 'agents.md' || lower === 'claude.md') return true;
  return false;
}

function isDocsOnlyPath(path: string): boolean {
  const top = path.split('/')[0] ?? '';
  if (
    top === 'docs' ||
    top === '.agents' ||
    top === '.claude' ||
    top === '.cursor' ||
    top === '.review' ||
    top === '.github' ||
    top === '.dwp' ||
    top === 'tmp' ||
    top === 'apps' ||
    top === 'scripts' ||
    top === 'tests'
  ) {
    return true;
  }
  return false;
}

/**
 * Pure mapping from changed paths + registry → affected prototype slugs.
 * Unit-tested without git.
 */
export function mapChangedPaths(
  paths: readonly string[],
  registry: AffectedRegistry
): MapChangedPathsResult {
  const known = registry.entries
    .filter((e) => e.kind === 'prototype')
    .map((e) => e.slug)
    .filter(Boolean);
  const knownSet = new Set(known);
  const sortedKnown = [...knownSet].sort((a, b) => a.localeCompare(b));

  const individual = new Set<string>();
  let sharedReason: string | undefined;

  for (const raw of paths) {
    const classified = classifyPath(raw);
    if (classified.effect === 'none') continue;
    if (classified.effect === 'all') {
      sharedReason ??= classified.reason;
      continue;
    }
    individual.add(classified.slug);
  }

  if (sharedReason) {
    const reasons: Record<string, string> = {};
    for (const slug of sortedKnown) reasons[slug] = sharedReason;
    return { slugs: sortedKnown, reasons, all: true, skipped: [] };
  }

  // Only indexed prototypes can be validated or built. `git diff` also lists
  // deleted and renamed folders, and the registry is re-indexed on every
  // load, so a new folder with a valid manifest is already in it.
  const changed = [...individual].sort((a, b) => a.localeCompare(b));
  const slugs = changed.filter((slug) => knownSet.has(slug));
  const skipped = changed.filter((slug) => !knownSet.has(slug));
  const reasons: Record<string, string> = {};
  for (const slug of slugs) reasons[slug] = 'prototype';
  return { slugs, reasons, all: false, skipped };
}

export interface GitDiffPathsResult {
  paths: string[];
  durationMs: number;
  range: string;
}

/** Runs `git diff --name-only <ref>...HEAD` with shell:false. */
export async function gitDiffNameOnly(
  root: string,
  ref: string,
  options: { gitBin?: string; timeoutMs?: number } = {}
): Promise<GitDiffPathsResult> {
  const safeRef = assertSafeGitRef(ref);
  const range = `${safeRef}...HEAD`;
  const bin = options.gitBin ?? 'git';
  const started = performance.now();
  const result = await run(bin, ['diff', '--name-only', range], {
    cwd: root,
    timeoutMs: options.timeoutMs ?? 30_000,
  });
  const durationMs = performance.now() - started;

  if (result.spawnError) {
    throw new CliError('failure', `Could not run git: ${result.spawnError}`, {
      hint: 'Install git and ensure it is on PATH (`pnpm protoyard doctor`).',
    });
  }
  if (result.timedOut) {
    throw new CliError('failure', `git diff timed out for range ${range}.`);
  }
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim() || `exit ${result.code}`;
    throw new CliError('failure', `git diff failed for range ${range}: ${detail}`, {
      hint: 'Check that --since names a reachable commit in this repository.',
    });
  }

  const paths = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return { paths, durationMs, range };
}
