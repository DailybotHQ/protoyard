import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CliError } from './output.ts';
import { canonicalPath, isInside, samePath, type WorkspacePaths } from './paths.ts';

/**
 * Guard for every folder the CLI empties or replaces (`build --out`,
 * `export`, `showcase --out`, `quick`). Vite's --emptyOutDir and the showcase
 * swap delete recursively, so the rule is an ALLOW-list, applied to canonical
 * paths (case and symlinks resolved — see canonicalPath):
 *
 *   1. strictly inside <root>/artifacts/ or <root>/tmp/  → allowed;
 *   2. strictly inside <root>/.protoyard/quick/ (ADR-031) → only for the
 *      quick marker, only through real folders (no symlinked segment), and
 *      only if the folder is missing, empty or already a quick exploration;
 *      every other output is refused there, so a build never empties an
 *      exploration;
 *   3. anywhere else in the workspace, or outside it with
 *      --allow-external-out → only if the folder is missing, empty, or
 *      carries our marker from a previous run;
 *   4. never the workspace itself, an ancestor of it, the home folder, a
 *      source/tooling folder (.git, node_modules, packages, apps, prototypes,
 *      templates, docs, scripts, tests, .github, .agents, .claude, .dwp), a
 *      folder that contains a zone, or a path that is itself a symlink.
 */

/** Written into a build output after a successful build; holds its provenance. */
export const BUILD_MARKER = '.protoyard-out';
/** Written into a showcase site; required before an existing site is replaced. */
export const SHOWCASE_MARKER = '.protoyard-showcase';
/** Written into every quick exploration folder (ADR-031). */
export const QUICK_MARKER = '.protoyard-quick';
/** Hidden bookkeeping files that never belong in a ZIP or a digest. */
export const OUTPUT_MARKERS: ReadonlySet<string> = new Set([
  BUILD_MARKER,
  SHOWCASE_MARKER,
  QUICK_MARKER,
]);

/** The quick zone, `<root>/.protoyard/quick` (explorations and the shared player). */
export function quickZone(root: string): string {
  return join(root, '.protoyard', 'quick');
}

const PROTECTED_TOP_LEVEL = [
  '.git',
  'node_modules',
  'packages',
  'apps',
  'prototypes',
  'templates',
  'docs',
  'scripts',
  'tests',
  '.github',
  '.agents',
  '.claude',
  '.dwp',
];

export interface OutputGuardInput {
  root: string;
  paths: WorkspacePaths;
  /** As typed by the user (relative to the root, or absolute). */
  requested: string;
  marker: string;
  allowExternal?: boolean;
  /** Flag name for messages, e.g. `--out`. */
  flag?: string;
}

/** Whether `dir` may receive an output carrying `marker`: anything but `occupied` may. */
export function outputDirState(
  dir: string,
  marker: string
): 'missing' | 'empty' | 'marked' | 'occupied' {
  if (!existsSync(dir)) return 'missing';
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 'occupied';
  }
  const meaningful = names.filter((n) => n !== '.DS_Store');
  if (meaningful.length === 0) return 'empty';
  return meaningful.includes(marker) ? 'marked' : 'occupied';
}

/**
 * Refuses when any EXISTING segment between `root` and `path` is a symlink.
 * Canonical containment alone would follow a symlinked `.protoyard` out of
 * the workspace; the quick zone must be reached through real folders.
 */
function refuseSymlinkedSegments(root: string, path: string, refuse: (why: string) => never): void {
  const rel = relative(resolve(root), path);
  // Canonically inside, lexically elsewhere: the spelling went through a link.
  if (rel === '' || isAbsolute(rel) || rel.split(sep)[0] === '..')
    refuse('reach it through the workspace path, not a link or another spelling.');
  let current = resolve(root);
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) refuse('the path goes through a symlink.');
    } catch (error) {
      if (error instanceof CliError) throw error;
      return; // the rest does not exist yet
    }
  }
}

/** Returns the canonical, safe output folder or throws `unsafe_path`. */
export function guardOutputDir(input: OutputGuardInput): string {
  const flag = input.flag ?? '--out';
  const lexical = resolve(input.root, input.requested);
  const refuse = (why: string, hint?: string): never => {
    throw new CliError('unsafe_path', `Refusing ${flag} ${input.requested}: ${why}`, {
      hint:
        hint ??
        `Use a folder under artifacts/ (e.g. ${flag} artifacts/my-build) — the default needs no flag.`,
    });
  };

  try {
    if (lstatSync(lexical).isSymbolicLink())
      refuse('it is a symlink; outputs are never written through links.');
  } catch (error) {
    if (error instanceof CliError) throw error;
    // does not exist yet: fine
  }

  const target = canonicalPath(lexical);
  const root = canonicalPath(input.root);
  if (isInside(target, root)) refuse('it is the workspace or one of its parent folders.');
  if (isInside(target, homedir())) refuse('it is your home folder or contains it.');

  const inWorkspace = isInside(root, target);
  if (inWorkspace) {
    for (const name of PROTECTED_TOP_LEVEL) {
      const dir = join(root, name);
      if (isInside(dir, target) || isInside(target, dir))
        refuse(`it is inside, or contains, ${name}/ (sources, history or dependencies).`);
    }
    const quick = quickZone(input.root);
    if (isInside(target, quick)) refuse('it contains .protoyard/quick/ (explorations).');
    if (isInside(quick, target)) {
      if (input.marker !== QUICK_MARKER)
        refuse('it is inside .protoyard/quick/, which only `protoyard quick` writes.');
      refuseSymlinkedSegments(input.root, lexical, refuse);
    } else {
      for (const zone of [input.paths.artifacts, join(input.root, 'tmp')]) {
        // Strictly inside: `--out artifacts` itself would empty every artifact.
        if (isInside(zone, target) && !samePath(zone, target)) return target;
        if (isInside(target, zone))
          refuse(`it contains ${zone === input.paths.artifacts ? 'artifacts' : 'tmp'}/.`);
      }
    }
  } else if (!input.allowExternal) {
    refuse(
      'it is outside the workspace.',
      `Pass --allow-external-out to write to ${target} (it must be empty or new).`
    );
  }

  const state = outputDirState(target, input.marker);
  if (state === 'occupied') {
    refuse(
      'the folder has files that Protoyard did not create.',
      `Choose an empty or new folder, or one previously written by Protoyard (it holds ${input.marker}).`
    );
  }
  return target;
}

export interface OutputFileGuardInput {
  root: string;
  paths: WorkspacePaths;
  /** As typed by the user (relative to the root, or absolute). */
  requested: string;
  /** Extra folders a file may land in (e.g. `prototypes/<slug>/docs` for REVIEW.md). */
  allowedDirs?: readonly string[];
  /** Flag name for messages, e.g. `--out`. */
  flag?: string;
}

/**
 * Guard for a single FILE the CLI writes from untrusted data (`comments pull
 * --out`, `comments export --out`). Stricter than guardOutputDir because the
 * file is replaced in place: the target must be strictly inside artifacts/,
 * tmp/ or an `allowedDirs` folder, no existing segment between the workspace
 * root and the file may be a symlink, an existing target must be a regular
 * file, and the deploy ledger folder (artifacts/publish) is never a target.
 * There is no --allow-external-out escape hatch.
 */
export function guardOutputFile(input: OutputFileGuardInput): string {
  const flag = input.flag ?? '--out';
  const refuse = (why: string): never => {
    throw new CliError('unsafe_path', `Refusing ${flag} ${input.requested}: ${why}`, {
      hint: `Write the file under artifacts/ or tmp/ (e.g. ${flag} tmp/review.md).`,
    });
  };
  const root = resolve(input.root);
  const lexical = resolve(root, input.requested);
  const rel = relative(root, lexical);
  if (rel === '' || isAbsolute(rel) || rel.split(sep)[0] === '..')
    refuse('it is outside the workspace.');

  // Every existing segment, the file included, must be a real folder or file.
  let current = root;
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(current);
    } catch {
      break; // the rest does not exist yet
    }
    if (stat.isSymbolicLink()) refuse('the path goes through a symlink.');
    if (current === lexical && !stat.isFile()) refuse('it exists and is not a regular file.');
  }

  const target = canonicalPath(lexical);
  if (isInside(join(input.paths.artifacts, 'publish'), target))
    refuse('it is inside artifacts/publish/ (the deploy ledger).');
  const zones = [input.paths.artifacts, join(root, 'tmp'), ...(input.allowedDirs ?? [])];
  for (const zone of zones) {
    if (isInside(zone, target) && !samePath(zone, target)) return target;
  }
  return refuse(
    'only files under artifacts/ or tmp/ may be written (never source folders, .git or config files).'
  );
}
