import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesignSystemBinding } from '@protoyard/core';
import {
  contentHash,
  DESIGN_SYSTEMS_DIR,
  type DesignSystemLocation,
  DOCUMENT_FILE,
  isDesignSystemId,
  lockRefusal,
  MAX_DOCUMENT_BYTES,
  readApproval,
  readComponents,
} from './design-systems.ts';
import { CliError } from './output.ts';
import { hasControlCharacter } from './paths.ts';

/**
 * Design systems in the workspace index (PLAN_013 T-registry, ADR-047).
 *
 * `protoyard index` lists every `design-systems/<id>/` folder and flat
 * `design-systems/<id>.json` document in the registry's own top-level
 * `designSystems` array, not as `entries` with a new `kind`: a gallery or CLI
 * that predates design systems validates `entries[].kind` and would report
 * each one as invalid, while it ignores a top-level field it does not know.
 *
 * Indexing reads data only, never component sources: each document (for its
 * id, name and version), `approval.json` and `components.json`. Documents are
 * not compiled here (`ds validate` does that). Nothing it reads can fail the
 * index: a problem becomes an entry in `designSystemIssues`.
 */

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DOCUMENT_FORMAT = 'texuli/design-system';
const MAX_NAME = 120;

/** A prototype bound to a design system in its manifest. */
export interface RegistryBoundPrototype {
  slug: string;
  name: string;
  /** The exact version the prototype pins. */
  version: string;
  locked: boolean;
}

export interface RegistryDesignSystem {
  id: string;
  name: string;
  /** The document's `version`. */
  version: string;
  /** From `approval.json`; a flat document is always a draft. */
  status: 'draft' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
  /** The version `approval.json` approved (it may differ from `version`). */
  approvedVersion: string | null;
  /** SHA-256 of the document now (canonical JSON without approval fields). */
  contentHash: string;
  /** True when `ds use --lock` would accept it: approved at this version, unchanged since. */
  lockable: boolean;
  layout: 'folder' | 'flat';
  /** Workspace-relative POSIX path: the folder, or the flat file. */
  path: string;
  /** Entries in `components.json` (0 for a flat document). */
  componentCount: number;
  /** Prototypes whose manifest `designSystem.id` is this id, sorted by slug. */
  boundPrototypes: RegistryBoundPrototype[];
}

export interface DesignSystemIssue {
  path: string;
  errors: string[];
}

/** What the indexer needs from a registry entry. */
export interface BindingSource {
  kind: string;
  slug: string;
  name: string;
  /** Workspace-relative folder, e.g. `prototypes/crm-demo`. */
  path: string;
  designSystem: DesignSystemBinding | null;
}

interface DocumentFacts {
  id: string;
  name: string;
  version: string;
  document: unknown;
}

function message(error: unknown): string {
  if (error instanceof CliError) {
    return error.hint ? `${error.message} ${error.hint}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Reads one document file as data: size cap, no symlink, JSON object, the fields the index needs. */
function readDocument(absolute: string, label: string, expectedId: string): DocumentFacts {
  if (!existsSync(absolute)) throw new Error(`Missing ${label}.`);
  const link = lstatSync(absolute);
  if (link.isSymbolicLink()) throw new Error(`${label} is a symlink; it must be a regular file.`);
  if (!link.isFile()) throw new Error(`${label} is not a regular file.`);
  if (link.size > MAX_DOCUMENT_BYTES) throw new Error(`${label} is larger than 1 MiB.`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  const document = raw as Record<string, unknown>;
  if (document.format !== DOCUMENT_FORMAT) {
    throw new Error(`${label} is not a "${DOCUMENT_FORMAT}" document.`);
  }
  if (document.id !== expectedId) {
    throw new Error(
      `${label} declares id ${JSON.stringify(document.id)}, but its location names "${expectedId}".`
    );
  }
  if (typeof document.version !== 'string' || !SEMVER.test(document.version)) {
    throw new Error(`${label} has no exact semver "version".`);
  }
  const name =
    typeof document.name === 'string' &&
    document.name.trim() !== '' &&
    document.name.length <= MAX_NAME &&
    !hasControlCharacter(document.name)
      ? document.name.trim()
      : expectedId;
  return { id: expectedId, name, version: document.version, document: raw };
}

function boundTo(id: string, entries: readonly BindingSource[]): RegistryBoundPrototype[] {
  return entries
    .filter((entry) => entry.kind === 'prototype' && entry.designSystem?.id === id)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      version: (entry.designSystem as DesignSystemBinding).version,
      locked: (entry.designSystem as DesignSystemBinding).locked === true,
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

function indexFolder(
  root: string,
  id: string,
  entries: readonly BindingSource[]
): RegistryDesignSystem {
  const dir = join(root, DESIGN_SYSTEMS_DIR, id);
  const label = `${DESIGN_SYSTEMS_DIR}/${id}/${DOCUMENT_FILE}`;
  const absolute = join(dir, DOCUMENT_FILE);
  const facts = readDocument(absolute, label, id);
  const location: DesignSystemLocation = { layout: 'folder', file: label, absolute, dir, id };
  const approval = readApproval(location);
  const components = readComponents(location);
  const approved = approval?.status === 'approved';
  return {
    id,
    name: facts.name,
    version: facts.version,
    status: approved ? 'approved' : 'draft',
    approvedBy: approved ? (approval?.approvedBy ?? null) : null,
    approvedAt: approved ? (approval?.approvedAt ?? null) : null,
    approvedVersion: approved ? (approval?.version ?? null) : null,
    contentHash: contentHash(facts.document),
    lockable: lockRefusal(location, facts.document, facts.version) === null,
    layout: 'folder',
    path: `${DESIGN_SYSTEMS_DIR}/${id}`,
    componentCount: components?.components.length ?? 0,
    boundPrototypes: boundTo(id, entries),
  };
}

function indexFlat(
  root: string,
  id: string,
  entries: readonly BindingSource[]
): RegistryDesignSystem {
  const path = `${DESIGN_SYSTEMS_DIR}/${id}.json`;
  const facts = readDocument(join(root, path), path, id);
  return {
    id,
    name: facts.name,
    version: facts.version,
    status: 'draft',
    approvedBy: null,
    approvedAt: null,
    approvedVersion: null,
    contentHash: contentHash(facts.document),
    lockable: false,
    layout: 'flat',
    path,
    componentCount: 0,
    boundPrototypes: boundTo(id, entries),
  };
}

/**
 * Lists the workspace's design systems and the prototypes bound to each.
 * One level under `design-systems/`, no recursion, no symlinks; never throws.
 */
export function indexDesignSystems(
  root: string,
  entries: readonly BindingSource[]
): { designSystems: RegistryDesignSystem[]; issues: DesignSystemIssue[] } {
  const designSystems: RegistryDesignSystem[] = [];
  const issues: DesignSystemIssue[] = [];
  const base = join(root, DESIGN_SYSTEMS_DIR);
  let names: string[] = [];
  try {
    if (lstatSync(base).isSymbolicLink()) {
      issues.push({
        path: DESIGN_SYSTEMS_DIR,
        errors: [`${DESIGN_SYSTEMS_DIR}/ is a symlink; design systems are not indexed through it.`],
      });
    } else {
      names = readdirSync(base).sort();
    }
  } catch {
    // No design-systems/ folder: a workspace without design systems.
  }

  const folders = new Set<string>();
  const flats: string[] = [];
  for (const name of names) {
    if (/^[._]/.test(name)) continue;
    const path = `${DESIGN_SYSTEMS_DIR}/${name}`;
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(join(base, name));
    } catch (error) {
      issues.push({ path, errors: [message(error)] });
      continue;
    }
    if (stat.isSymbolicLink()) {
      issues.push({
        path,
        errors: ['This is a symlink; symlinked design systems are not indexed.'],
      });
    } else if (stat.isDirectory()) {
      if (isDesignSystemId(name)) folders.add(name);
      else issues.push({ path, errors: [`"${name}" is not a design-system id (kebab-case).`] });
    } else if (stat.isFile() && name.endsWith('.json')) {
      const stem = name.slice(0, -'.json'.length);
      if (isDesignSystemId(stem)) flats.push(stem);
      else issues.push({ path, errors: [`"${stem}" is not a design-system id (kebab-case).`] });
    }
  }

  for (const id of folders) {
    try {
      designSystems.push(indexFolder(root, id, entries));
    } catch (error) {
      issues.push({ path: `${DESIGN_SYSTEMS_DIR}/${id}`, errors: [message(error)] });
    }
  }
  for (const id of flats) {
    const path = `${DESIGN_SYSTEMS_DIR}/${id}.json`;
    if (folders.has(id)) {
      issues.push({
        path,
        errors: [`design-systems/${id}/ takes precedence; this flat document is not used.`],
      });
      continue;
    }
    try {
      designSystems.push(indexFlat(root, id, entries));
    } catch (error) {
      issues.push({ path, errors: [message(error)] });
    }
  }

  const known = new Set([...folders, ...flats]);
  for (const entry of entries) {
    const binding = entry.designSystem;
    if (entry.kind !== 'prototype' || !binding || known.has(binding.id)) continue;
    issues.push({
      path: entry.path,
      errors: [
        `binds design system "${binding.id}", which is not in ${DESIGN_SYSTEMS_DIR}/ (no folder or flat document).`,
      ],
    });
  }

  designSystems.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  issues.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { designSystems, issues };
}
