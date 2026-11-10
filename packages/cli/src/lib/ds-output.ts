import { lstatSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DESIGN_SYSTEMS_DIR } from './design-systems.ts';
import { CliError } from './output.ts';
import { guardOutputFile } from './output-guard.ts';
import { canonicalPath, hasControlCharacter, workspacePaths } from './paths.ts';

/**
 * Where the design-system commands may write a file the user names
 * (`ds new --out`, MCP `ds_create.out`, `ds export --bundle --out`,
 * `check ds --write-baseline`, `ds extensions --out`):
 *
 * - a `.json` file strictly inside `design-systems/`, `artifacts/` (never
 *   `artifacts/publish/`) or `tmp/`, reached through real folders only
 *   (`guardOutputFile`);
 * - never a workspace config file (`package.json`, `protoyard.json`,
 *   `biome.json`, `tsconfig*.json`) or anything under `node_modules/`,
 *   `.git/`, `.github/`, `.protoyard/` or `src/generated/`, the names
 *   `blueprint new` refuses too;
 * - an existing file is replaced only when it already parses as the same
 *   kind of file: with `--force` (`existing: 'force-same-kind'`), or freely
 *   for regenerated outputs (`existing: 'same-kind-or-force'`, which needs
 *   `--force` for any other file).
 */

/** Workspace files these commands never write, even with --force. */
const RESERVED_BASENAME = /^(?:package|protoyard|biome|tsconfig(?:\..*)?)\.json$/i;
/** Folders these commands never write into. */
const RESERVED_DIRS = new Set(['node_modules', '.git', '.github', '.protoyard']);
/** The most bytes read to decide whether an existing file is the same kind. */
const MAX_SAME_KIND_BYTES = 16 * 1024 * 1024;

export interface DsOutputInput {
  root: string;
  /** As typed by the user (relative to the root, or absolute). */
  requested: string;
  /** Flag name for messages, e.g. `--out`. */
  flag: string;
  force: boolean;
  /** What the command writes, for messages ("a design-system document"). */
  kind: string;
  /** Whether a parsed existing file is the same kind of output. */
  sameKind: (value: unknown) => boolean;
  /**
   * `force-same-kind` (default): an existing file needs `--force` and must be
   * the same kind. `same-kind-or-force`: the same kind is replaced without a
   * flag (a regenerated output); any other file needs `--force`.
   */
  existing?: 'force-same-kind' | 'same-kind-or-force';
}

function readSameKind(file: string, sameKind: (value: unknown) => boolean): boolean {
  try {
    if (lstatSync(file).size > MAX_SAME_KIND_BYTES) return false;
    return sameKind(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return false;
  }
}

/** Returns the file to write (absolute), or throws `unsafe_path`, `usage` or `conflict`. */
export function guardDsOutputFile(input: DsOutputInput): string {
  const { requested, flag } = input;
  if (hasControlCharacter(requested) || requested.trim() === '') {
    throw new CliError('unsafe_path', `Unsafe ${flag} path.`);
  }
  if (!requested.toLowerCase().endsWith('.json')) {
    throw new CliError('usage', `${flag} must name a .json file: ${requested}`);
  }
  const root = input.root;
  // MCP passes canonical absolute paths; the root may be spelled through a
  // link (macOS /var → /private/var). Re-spell such a path from the root so
  // every segment below it is still checked for links.
  let requestedPath = requested;
  if (isAbsolute(requested)) {
    const fromCanonical = relative(canonicalPath(root), resolve(requested));
    if (fromCanonical && !isAbsolute(fromCanonical) && fromCanonical.split(sep)[0] !== '..')
      requestedPath = fromCanonical;
  }
  const zones = `${DESIGN_SYSTEMS_DIR}/, artifacts/ or tmp/`;
  const hint = `Write it under ${zones} (e.g. ${flag} tmp/${basename(requested)}).`;
  let canonical: string;
  try {
    canonical = guardOutputFile({
      root,
      paths: workspacePaths(root),
      requested: requestedPath,
      allowedDirs: [join(root, DESIGN_SYSTEMS_DIR)],
      flag,
    });
  } catch (error) {
    if (error instanceof CliError && error.code === 'unsafe_path') {
      throw new CliError(
        'unsafe_path',
        error.message.replace('only files under artifacts/ or tmp/', `only files under ${zones}`),
        { hint }
      );
    }
    throw error;
  }
  // guardOutputFile refused every symlinked segment below the root, so the
  // lexical path names the same file and keeps the root's own spelling.
  const target = resolve(root, requestedPath);
  const segments = relative(canonicalPath(root), canonical)
    .split(sep)
    .map((s) => s.toLowerCase());
  const underGenerated = segments.some((s, i) => s === 'src' && segments[i + 1] === 'generated');
  if (
    RESERVED_BASENAME.test(basename(target)) ||
    segments.some((s) => RESERVED_DIRS.has(s)) ||
    underGenerated
  ) {
    throw new CliError('unsafe_path', `Refusing ${flag} ${requested}: a protected file name.`, {
      hint: `package.json, protoyard.json, biome.json, tsconfig*.json, node_modules/, .git/, .github/, .protoyard/ and src/generated/ are never targets. ${hint}`,
    });
  }
  let exists = false;
  try {
    exists = lstatSync(target).isFile();
  } catch {
    exists = false;
  }
  if (!exists) return target;
  const same = readSameKind(target, input.sameKind);
  const mode = input.existing ?? 'force-same-kind';
  if (mode === 'same-kind-or-force') {
    if (same || input.force) return target;
    throw new CliError('conflict', `${requested} exists and is not ${input.kind}.`, {
      hint: 'Pass --force to replace it, or choose another file name.',
    });
  }
  if (!input.force) {
    throw new CliError('conflict', `${requested} already exists.`, {
      hint: 'Pass --force to replace it, or choose another file name.',
    });
  }
  if (!same) {
    throw new CliError(
      'conflict',
      `${requested} exists and is not ${input.kind}; --force only replaces ${input.kind}.`,
      { hint: 'Choose another file name.' }
    );
  }
  return target;
}

/** An object whose `format` is `format`. */
export function hasFormat(format: string): (value: unknown) => boolean {
  return (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { format?: unknown }).format === format;
}
