import { homedir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { checkSlug } from '@protoyard/core';
import { CliError } from '../output.ts';
import { guardOutputDir, outputDirState, QUICK_MARKER, quickZone } from '../output-guard.ts';
import { canonicalPath, childPath, isInside, workspacePaths } from '../paths.ts';
import { assertSlug } from '../workspace.ts';

/**
 * Where quick explorations live (ADR-031): `<workspace>/.protoyard/quick/<slug>/`,
 * or `./.protoyard/quick/<slug>/` under the working folder when there is no
 * workspace, or an explicit `--out`. Every path goes through guardOutputDir
 * with the quick marker, so an exploration never lands in a source folder,
 * the home folder itself, through a symlink, or over files Protoyard did not
 * write.
 */

/** Shared prebuilt player folder inside the zone; not a valid slug, so never an exploration. */
export const QUICK_PLAYER_DIR = '_player';

const PLAYER_VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,32})?$/;

export interface QuickBase {
  /** Folder the zone hangs from: the workspace root, or the working folder outside one. */
  base: string;
  /** `<base>/.protoyard/quick`. */
  zone: string;
  inWorkspace: boolean;
}

export interface QuickBaseInput {
  /** The resolved workspace root, or null when the CLI runs outside a workspace. */
  workspaceRoot: string | null;
  cwd: string;
  /** Injectable for tests; defaults to the user's home folder. */
  home?: string;
}

export function resolveQuickBase(input: QuickBaseInput): QuickBase {
  if (input.workspaceRoot !== null) {
    const base = canonicalPath(input.workspaceRoot);
    return { base, zone: quickZone(base), inWorkspace: true };
  }
  const base = canonicalPath(input.cwd);
  if (isInside(base, input.home ?? homedir())) {
    throw new CliError(
      'unsafe_path',
      `Refusing to keep explorations in ${base}: it is your home folder or contains it.`,
      { hint: 'Run `protoyard quick` from a project folder, or pass --out <dir>.' }
    );
  }
  return { base, zone: quickZone(base), inWorkspace: false };
}

export interface QuickDirInput extends QuickBaseInput {
  slug: string;
  /** `--out` as typed: relative to the base, or absolute. */
  out?: string;
  /** `--allow-external-out`: an `--out` outside the base, still empty, new or marked. */
  allowExternal?: boolean;
}

export interface QuickDir extends QuickBase {
  slug: string;
  /** Canonical exploration folder. */
  dir: string;
  /** `missing` and `empty` are new explorations; `marked` is an existing one. */
  state: 'missing' | 'empty' | 'marked';
  /** True when `--out` chose the folder. */
  custom: boolean;
}

/** Resolves and guards an exploration folder, or throws `usage` / `unsafe_path`. */
export function resolveQuickDir(input: QuickDirInput): QuickDir {
  const slug = assertSlug(input.slug);
  const location = resolveQuickBase(input);
  const custom = input.out !== undefined;
  const requested = custom ? (input.out as string) : childPath(location.zone, slug);
  const dir = guardOutputDir({
    root: location.base,
    paths: workspacePaths(location.base),
    requested,
    marker: QUICK_MARKER,
    allowExternal: custom && input.allowExternal === true,
    flag: custom ? '--out' : 'the exploration folder',
  });

  const refuse = (why: string): never => {
    throw new CliError('unsafe_path', `Refusing ${custom ? `--out ${requested}` : dir}: ${why}`, {
      hint: 'Choose a new folder, or one an earlier `protoyard quick` wrote.',
    });
  };
  // Inside the zone, only a direct child named like a slug: `_player` and
  // nested folders belong to Protoyard.
  if (isInside(location.zone, dir)) {
    const rel = relative(canonicalPath(location.zone), dir);
    if (isAbsolute(rel) || rel.includes(sep) || !checkSlug(rel).ok)
      refuse('inside .protoyard/quick/ an exploration is one folder named like a slug.');
  }
  // guardOutputDir lets artifacts/ and tmp/ through unchecked; explorations
  // never write over files they did not create, wherever they land.
  const state = outputDirState(dir, QUICK_MARKER);
  if (state === 'occupied')
    return refuse(`the folder has files that Protoyard did not create (no ${QUICK_MARKER}).`);
  return { ...location, slug, dir, state, custom };
}

/** `<zone>/_player/<version>/`, the shared prebuilt player for one version. */
export function quickPlayerDir(zone: string, version: string): string {
  if (!PLAYER_VERSION_PATTERN.test(version)) {
    throw new CliError('unsafe_path', `Refusing player version "${version}" (expected semver).`);
  }
  return childPath(join(zone, QUICK_PLAYER_DIR), version);
}
