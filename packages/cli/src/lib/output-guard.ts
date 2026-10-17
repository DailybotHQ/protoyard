import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CliError } from './output.ts';
import { canonicalPath, isInside, samePath, type WorkspacePaths } from './paths.ts';

/**
 * Guard for every folder the CLI empties or replaces (`build --out`,
 * `export`, `showcase --out`). Vite's --emptyOutDir and the showcase swap
 * delete recursively, so the rule is an ALLOW-list, applied to canonical
 * paths (case and symlinks resolved — see canonicalPath):
 *
 *   1. strictly inside <root>/artifacts/ or <root>/tmp/  → allowed;
 *   2. anywhere else in the workspace, or outside it with
 *      --allow-external-out → only if the folder is missing, empty, or
 *      carries our marker from a previous run;
 *   3. never the workspace itself, an ancestor of it, the home folder, a
 *      source/tooling folder (.git, node_modules, packages, apps, prototypes,
 *      templates, docs, scripts, tests, .github, .agents, .claude, .dwp), or a
 *      path that is itself a symlink.
 */

/** Written into a build output after a successful build; holds its provenance. */
export const BUILD_MARKER = '.protoyard-out';
/** Written into a showcase site; required before an existing site is replaced. */
export const SHOWCASE_MARKER = '.protoyard-showcase';
/** Hidden bookkeeping files that never belong in a ZIP or a digest. */
export const OUTPUT_MARKERS: ReadonlySet<string> = new Set([BUILD_MARKER, SHOWCASE_MARKER]);

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

function isEmptyOrMarked(dir: string, marker: string): 'missing' | 'empty' | 'marked' | 'occupied' {
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
    for (const zone of [input.paths.artifacts, join(input.root, 'tmp')]) {
      // Strictly inside: `--out artifacts` itself would empty every artifact.
      if (isInside(zone, target) && !samePath(zone, target)) return target;
      if (isInside(target, zone))
        refuse(`it contains ${zone === input.paths.artifacts ? 'artifacts' : 'tmp'}/.`);
    }
  } else if (!input.allowExternal) {
    refuse(
      'it is outside the workspace.',
      `Pass --allow-external-out to write to ${target} (it must be empty or new).`
    );
  }

  const state = isEmptyOrMarked(target, input.marker);
  if (state === 'occupied') {
    refuse(
      'the folder has files that Protoyard did not create.',
      `Choose an empty or new folder, or one previously written by Protoyard (it holds ${input.marker}).`
    );
  }
  return target;
}
