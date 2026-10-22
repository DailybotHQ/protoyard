import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  type AnyBlueprint,
  type BlueprintKind,
  blueprintKind,
  brandThemeId,
  safeParseAnyBlueprint,
} from '@protoyard/blueprint';
import { MANIFEST_FILENAME, type PrototypeManifest, safeParseManifest } from '@protoyard/core';
import { toPosixRelative, type WorkspacePaths } from './paths.ts';

/**
 * Discovery is deliberately bounded: one directory level under `prototypes/`
 * and `templates/`, flat app `blueprints/*.json` files plus closed one-level
 * content-kind shelves, no recursion, a size
 * ceiling per file, and JSON data only — prototype code is never imported.
 */

export const MANIFEST_MAX_BYTES = 256 * 1024;
/** Catalog blueprints are data-only; keep them small. */
export const BLUEPRINT_MAX_BYTES = 256 * 1024;

export type FolderKind = 'prototype' | 'template' | 'blueprint';

export interface ManifestLocation {
  folderKind: FolderKind;
  /** Content blueprint folder discriminator; flat blueprints default to `app`. */
  blueprintKind?: BlueprintKind;
  /** Folder name (expected to equal the manifest slug), or blueprint file stem. */
  folder: string;
  dir: string;
  manifestPath: string;
  /**
   * Workspace-relative POSIX path of the folder, e.g. `prototypes/crm-demo`,
   * or of the blueprint file, e.g. `blueprints/crm.json`.
   */
  relDir: string;
  /**
   * The folder is a symlink. It is reported, never indexed: a linked folder
   * could point anywhere on disk and pull outside files into builds.
   */
  symlink?: boolean;
}

export interface ParsedBlueprintCatalog {
  blueprint: AnyBlueprint | null;
  blueprintKind: BlueprintKind | null;
  /** Stable id for the registry (`local.blueprint.<slug>`). */
  id: string | null;
  slug: string | null;
  errors: string[];
}

export interface ManifestStat {
  mtimeMs: number;
  size: number;
}

export interface ParsedManifest {
  manifest: PrototypeManifest | null;
  errors: string[];
}

/** Lists candidate folders and catalog blueprint files. Hidden/private names are skipped. */
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
        .map((e) => (e.isSymbolicLink() ? `\0${e.name}` : e.name));
    } catch {
      continue;
    }
    for (const raw of names.sort((a, b) =>
      a.replace('\0', '').localeCompare(b.replace('\0', ''))
    )) {
      const symlink = raw.startsWith('\0');
      const folder = symlink ? raw.slice(1) : raw;
      const dir = join(base, folder);
      out.push({
        ...(symlink ? { symlink: true } : {}),
        folderKind,
        folder,
        dir,
        manifestPath: join(dir, MANIFEST_FILENAME),
        relDir: toPosixRelative(paths.root, dir),
      });
    }
  }

  // Flat catalog: blueprints/<slug>.json (data only, no folder).
  try {
    const entries = await readdir(paths.blueprints, { withFileTypes: true });
    for (const entry of entries
      .filter((e) => e.isFile() && e.name.endsWith('.json') && !/^[._]/.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const slug = basename(entry.name, '.json');
      const manifestPath = join(paths.blueprints, entry.name);
      out.push({
        folderKind: 'blueprint',
        blueprintKind: 'app',
        folder: slug,
        dir: paths.blueprints,
        manifestPath,
        relDir: toPosixRelative(paths.root, manifestPath),
      });
    }
  } catch {
    // Missing blueprints/ is fine — catalogs are optional.
  }

  // Content catalogs live in a closed set of one-level folders. Do not recurse
  // through arbitrary directories or follow symlinks from this data boundary.
  const contentFolders = [
    ['deck', 'decks'],
    ['page', 'pages'],
    ['doc', 'docs'],
  ] as const satisfies readonly (readonly [BlueprintKind, string])[];
  for (const [kind, folder] of contentFolders) {
    const base = join(paths.blueprints, folder);
    try {
      const entries = await readdir(base, { withFileTypes: true });
      for (const entry of entries
        .filter((e) => e.isFile() && e.name.endsWith('.json') && !/^[._]/.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const slug = basename(entry.name, '.json');
        const manifestPath = join(base, entry.name);
        out.push({
          folderKind: 'blueprint',
          blueprintKind: kind,
          folder: slug,
          dir: base,
          manifestPath,
          relDir: toPosixRelative(paths.root, manifestPath),
        });
      }
    } catch {
      // A missing kind shelf is fine; catalog content is optional.
    }
  }
  return out;
}

export async function statManifest(location: ManifestLocation): Promise<ManifestStat | null> {
  if (location.symlink) return null;
  try {
    const link = await lstat(location.manifestPath);
    // A symlinked manifest is treated as missing data; readManifest explains why.
    if (link.isSymbolicLink()) return null;
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
  if (location.symlink) {
    return {
      manifest: null,
      errors: ['This folder is a symlink; symlinked prototype folders are not indexed or built.'],
    };
  }
  if (!fileStat) {
    let linked = false;
    try {
      linked = (await lstat(location.manifestPath)).isSymbolicLink();
    } catch {
      // missing
    }
    return {
      manifest: null,
      errors: [
        linked
          ? `${MANIFEST_FILENAME} is a symlink; it must be a regular file.`
          : `Missing ${MANIFEST_FILENAME}.`,
      ],
    };
  }
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

/**
 * Reads a catalog blueprint file. App catalogs require brand + catalog;
 * content kind catalogs require catalog and may omit brand. Never throws.
 */
export async function readBlueprintCatalog(
  location: ManifestLocation,
  fileStat: ManifestStat | null
): Promise<ParsedBlueprintCatalog> {
  if (location.folderKind !== 'blueprint') {
    return {
      blueprint: null,
      blueprintKind: null,
      id: null,
      slug: null,
      errors: ['Not a blueprint location.'],
    };
  }
  if (!fileStat) {
    return {
      blueprint: null,
      blueprintKind: null,
      id: null,
      slug: null,
      errors: [`Missing blueprint file ${location.relDir}.`],
    };
  }
  if (fileStat.size > BLUEPRINT_MAX_BYTES) {
    return {
      blueprint: null,
      blueprintKind: null,
      id: null,
      slug: null,
      errors: [`Blueprint is ${fileStat.size} bytes (limit ${BLUEPRINT_MAX_BYTES}).`],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(location.manifestPath, 'utf8'));
  } catch (error) {
    return {
      blueprint: null,
      blueprintKind: null,
      id: null,
      slug: null,
      errors: [`Not valid JSON: ${(error as Error).message}`],
    };
  }
  return validateBlueprintCatalogData(raw, location.folder, location.blueprintKind ?? 'app');
}

/** Pure validation of a catalog blueprint document (filename stem = slug). */
export async function validateBlueprintCatalogData(
  raw: unknown,
  slug: string,
  expectedKind: BlueprintKind = 'app'
): Promise<ParsedBlueprintCatalog> {
  const parsed = await safeParseAnyBlueprint(raw);
  if (!parsed.success) {
    return {
      blueprint: null,
      blueprintKind: null,
      id: null,
      slug: null,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const blueprint = parsed.data;
  const kind = blueprintKind(blueprint);
  const errors: string[] = [];
  if (kind !== expectedKind) {
    errors.push(`blueprint kind "${kind}" does not match its location (${expectedKind}).`);
  }
  if (kind === 'app' && !blueprint.brand) {
    errors.push('catalog blueprints need a "brand" block (seed and/or preset).');
  }
  if (!blueprint.catalog) {
    errors.push('catalog blueprints need a "catalog" block (category, …).');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(slug) || slug.length < 2) {
    errors.push(`file stem "${slug}" must be lowercase kebab-case (min 2 chars).`);
  }
  if (errors.length > 0) {
    return { blueprint: null, blueprintKind: null, id: null, slug: null, errors };
  }
  return {
    blueprint,
    blueprintKind: kind,
    id: `local.blueprint.${slug}`,
    slug,
    errors: [],
  };
}

/** Theme id a catalog blueprint would use after `protoyard generate`. */
export function catalogBlueprintThemeId(blueprint: AnyBlueprint): string {
  if (!blueprint.brand) return 'violet';
  return brandThemeId(blueprint.brand, blueprint.name);
}
