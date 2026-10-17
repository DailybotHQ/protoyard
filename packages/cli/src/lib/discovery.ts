import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MANIFEST_FILENAME, type PrototypeManifest, safeParseManifest } from '@protoyard/core';
import { toPosixRelative, type WorkspacePaths } from './paths.ts';

/**
 * Discovery is deliberately bounded: one directory level under `prototypes/`
 * and `templates/`, no recursion, a size ceiling per manifest, and manifests
 * are parsed as JSON data only — prototype code is never imported or executed.
 */

export const MANIFEST_MAX_BYTES = 256 * 1024;

export type FolderKind = 'prototype' | 'template';

export interface ManifestLocation {
  folderKind: FolderKind;
  /** Folder name (expected to equal the manifest slug). */
  folder: string;
  dir: string;
  manifestPath: string;
  /** Workspace-relative POSIX path of the folder, e.g. `prototypes/crm-demo`. */
  relDir: string;
}

export interface ManifestStat {
  mtimeMs: number;
  size: number;
}

export interface ParsedManifest {
  manifest: PrototypeManifest | null;
  errors: string[];
}

/** Lists candidate folders. Hidden (`.x`) and private (`_x`) folders are skipped. */
export async function listManifestLocations(paths: WorkspacePaths): Promise<ManifestLocation[]> {
  const groups: [FolderKind, string][] = [
    ['prototype', paths.prototypes],
    ['template', paths.templates],
  ];
  const out: ManifestLocation[] = [];
  for (const [folderKind, base] of groups) {
    let names: string[];
    try {
      const entries = await readdir(base, { withFileTypes: true });
      names = entries
        .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !/^[._]/.test(e.name))
        .map((e) => e.name);
    } catch {
      continue;
    }
    for (const folder of names.sort()) {
      const dir = join(base, folder);
      out.push({
        folderKind,
        folder,
        dir,
        manifestPath: join(dir, MANIFEST_FILENAME),
        relDir: toPosixRelative(paths.root, dir),
      });
    }
  }
  return out;
}

export async function statManifest(location: ManifestLocation): Promise<ManifestStat | null> {
  try {
    const s = await stat(location.manifestPath);
    if (!s.isFile()) return null;
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

/** Reads and validates one manifest. Never throws: problems become `errors`. */
export async function readManifest(
  location: ManifestLocation,
  fileStat: ManifestStat | null
): Promise<ParsedManifest> {
  if (!fileStat) return { manifest: null, errors: [`Missing ${MANIFEST_FILENAME}.`] };
  if (fileStat.size > MANIFEST_MAX_BYTES) {
    return {
      manifest: null,
      errors: [`${MANIFEST_FILENAME} is ${fileStat.size} bytes (limit ${MANIFEST_MAX_BYTES}).`],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(location.manifestPath, 'utf8'));
  } catch (error) {
    return {
      manifest: null,
      errors: [`${MANIFEST_FILENAME} is not valid JSON: ${(error as Error).message}`],
    };
  }
  return validateManifestData(raw, location);
}

export function validateManifestData(raw: unknown, location: ManifestLocation): ParsedManifest {
  const parsed = safeParseManifest(raw);
  if (!parsed.success) {
    return {
      manifest: null,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const manifest = parsed.data;
  const errors: string[] = [];
  if (manifest.slug !== location.folder) {
    errors.push(`slug "${manifest.slug}" must match its folder name "${location.folder}".`);
  }
  if (manifest.kind !== location.folderKind) {
    errors.push(
      `kind "${manifest.kind}" does not match its location (${location.folderKind}s/ folder).`
    );
  }
  if (manifest.defaultScenario && manifest.scenarios.length > 0) {
    if (!manifest.scenarios.includes(manifest.defaultScenario)) {
      errors.push(`defaultScenario "${manifest.defaultScenario}" is not listed in "scenarios".`);
    }
  }
  return errors.length > 0 ? { manifest: null, errors } : { manifest, errors };
}
