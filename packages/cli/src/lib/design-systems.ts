import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { designSystemContentHash } from '@texuli/spec/design-system';
import type { z } from 'zod';
import { checkAllow, formatIssue, readAllow, readDocumentApproval } from './ds-catalog.ts';
import {
  type Approval,
  ApprovalSchema,
  type ComponentsManifest,
  ComponentsManifestSchema,
} from './ds-contracts.ts';
import { jsonErrorText } from './json-error.ts';
import { CliError } from './output.ts';
import { hasControlCharacter } from './paths.ts';
import { workspaceFile } from './workspace-file.ts';

/**
 * Design-system folders (locked design systems, PLAN_013).
 *
 * A design system is either the original flat document
 * `design-systems/<id>.json`, or a folder:
 *
 * ```text
 * design-systems/<id>/
 *   document.json      the Texuli design-system document: allow, library and approval inside (spec 0.13.0)
 *   components.json    the design system's own components, with source hashes
 *   components/*.svelte
 *   approval.json      legacy sidecar: read when the document has no approval; `ds migrate` folds it in
 * ```
 *
 * Only a folder can be approved, and only an approved folder with an `allow`
 * section can be locked. The approval is a record, not a proof: the CLI cannot
 * tell who ran `ds approve`. A human commit reviewed through CODEOWNERS is the
 * guarantee.
 */

export const DESIGN_SYSTEMS_DIR = 'design-systems';
export const DOCUMENT_FILE = 'document.json';
export const APPROVAL_FILE = 'approval.json';
export const COMPONENTS_FILE = 'components.json';
export const COMPONENTS_DIR = 'components';
/** Texuli's import cap for JSON text (1 MiB). */
export const MAX_DOCUMENT_BYTES = 1_048_576;

const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

// The schemas live in ds-contracts.ts (one place for every design-system file).
export {
  type Approval,
  ApprovalSchema,
  type ComponentsManifest,
  ComponentsManifestSchema,
  type LibraryComponent,
  LibraryComponentSchema,
} from './ds-contracts.ts';

export function emptyComponentsManifest(): ComponentsManifest {
  return { format: 'protoyard/ds-components', version: 1, components: [] };
}

/** Where a design system lives: a folder (lockable) or a flat document. */
export interface DesignSystemLocation {
  layout: 'folder' | 'flat';
  /** Workspace-relative POSIX path of the document. */
  file: string;
  /** Absolute path of the document. */
  absolute: string;
  /** Absolute folder path (folder layout only). */
  dir?: string;
  /** The id the folder or flat file name implies (the document's own id is checked later). */
  id?: string;
}

export function isDesignSystemId(value: string): boolean {
  return ID_PATTERN.test(value);
}

function refuseSymlink(absolute: string, label: string): void {
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to read ${label} through a symlink.`, {
      hint: `Replace the link with a regular file or folder under ${DESIGN_SYSTEMS_DIR}/.`,
    });
  }
}

/**
 * Resolves `<id>` (a folder, then `design-systems/<id>.json`) or a workspace
 * file path to a document. Paths go through `workspaceFile`, which refuses
 * control characters, absolute paths outside the workspace and symlink
 * escapes.
 */
export function locateDesignSystem(root: string, ref: string): DesignSystemLocation {
  if (hasControlCharacter(ref))
    throw new CliError('unsafe_path', 'Unsafe design-system reference.');
  if (isDesignSystemId(ref)) {
    const dir = workspaceFile(root, join(DESIGN_SYSTEMS_DIR, ref));
    const document = join(dir, DOCUMENT_FILE);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      refuseSymlink(dir, `design-systems/${ref}`);
      if (!existsSync(document)) {
        throw new CliError('not_found', `design-systems/${ref}/ has no ${DOCUMENT_FILE}.`);
      }
      refuseSymlink(document, `design-systems/${ref}/${DOCUMENT_FILE}`);
      return {
        layout: 'folder',
        file: `${DESIGN_SYSTEMS_DIR}/${ref}/${DOCUMENT_FILE}`,
        absolute: document,
        dir,
        id: ref,
      };
    }
    const flat = workspaceFile(root, join(DESIGN_SYSTEMS_DIR, `${ref}.json`));
    if (existsSync(flat)) {
      return { layout: 'flat', file: `${DESIGN_SYSTEMS_DIR}/${ref}.json`, absolute: flat, id: ref };
    }
    throw new CliError('not_found', `No design system "${ref}".`, {
      hint: `Create one with \`protoyard ds new ${ref}\`, or pass a document path.`,
    });
  }
  const absolute = workspaceFile(root, ref);
  // Relative to the workspace, so an absolute path (MCP passes canonical
  // paths) finds a folder document the same way a relative one does.
  const normalized = relative(root, absolute).split(sep).join('/');
  const folder = normalized.match(/^design-systems\/([a-z][a-z0-9-]{0,63})\/document\.json$/);
  if (folder?.[1]) return locateDesignSystem(root, folder[1]);
  return { layout: 'flat', file: normalized, absolute };
}

export function readDocumentFile(location: DesignSystemLocation): unknown {
  if (!existsSync(location.absolute)) {
    throw new CliError('not_found', `No such file: ${location.file}.`);
  }
  if (statSync(location.absolute).size > MAX_DOCUMENT_BYTES) {
    throw new CliError('validation', `${location.file} is larger than 1 MiB.`);
  }
  try {
    return JSON.parse(readFileSync(location.absolute, 'utf8')) as unknown;
  } catch (error) {
    throw new CliError(
      'validation',
      `Could not read ${location.file}: it is ${jsonErrorText(error)}.`
    );
  }
}

function readJsonFile<T>(file: string, label: string, schema: z.ZodType<T>): T | null {
  if (!existsSync(file)) return null;
  if (lstatSync(file).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to read ${label} through a symlink.`);
  }
  if (statSync(file).size > MAX_DOCUMENT_BYTES) {
    throw new CliError('validation', `${label} is larger than 1 MiB.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CliError('validation', `Could not read ${label}: it is ${jsonErrorText(error)}.`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError('validation', `${label} is not valid.`, {
      hint: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join(' · '),
    });
  }
  return parsed.data;
}

/** The legacy `approval.json` sidecar of a folder, or null. */
export function readApprovalSidecar(location: DesignSystemLocation): Approval | null {
  if (!location.dir) return null;
  return readJsonFile(
    join(location.dir, APPROVAL_FILE),
    `design-systems/${location.id}/${APPROVAL_FILE}`,
    ApprovalSchema
  );
}

/**
 * A folder's approval: the document's own `approval` section first (spec
 * 0.13.0), then the legacy `approval.json` sidecar. `document` is read from
 * disk when it is not passed. Flat documents have none.
 */
export function readApproval(location: DesignSystemLocation, document?: unknown): Approval | null {
  if (!location.dir) return null;
  const own = readDocumentApproval(document === undefined ? readDocumentFile(location) : document);
  if (own) return own;
  return readApprovalSidecar(location);
}

/** Where `readApproval` found the approval: the document, the legacy sidecar, or nowhere. */
export function approvalSource(
  location: DesignSystemLocation,
  document: unknown
): 'document' | 'sidecar' | null {
  if (!location.dir) return null;
  if (readDocumentApproval(document)) return 'document';
  return existsSync(join(location.dir, APPROVAL_FILE)) ? 'sidecar' : null;
}

/** Writes a document as the CLI formats it (two-space JSON), refusing a symlink. */
export function writeDocumentFile(location: DesignSystemLocation, document: unknown): void {
  if (existsSync(location.absolute) && lstatSync(location.absolute).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to write ${location.file} through a symlink.`);
  }
  writeFileSync(location.absolute, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

export function readComponents(location: DesignSystemLocation): ComponentsManifest | null {
  if (!location.dir) return null;
  return readJsonFile(
    join(location.dir, COMPONENTS_FILE),
    `design-systems/${location.id}/${COMPONENTS_FILE}`,
    ComponentsManifestSchema
  );
}

/** JSON with sorted keys and no whitespace, so equal documents hash equally (Texuli's). */
export { canonicalJson } from '@texuli/spec/design-system';

/**
 * The content hash of a document: Texuli's `designSystemContentHash` (one
 * implementation), SHA-256 of the canonical JSON without the whole `approval`
 * section and without each library entry's own `approval`. A legacy sidecar
 * hash matches it for documents without a library.
 */
export function contentHash(document: unknown): string {
  // A clone: Texuli's hash before 0.15.0 could write into the object it hashed.
  return designSystemContentHash(structuredClone(document));
}

export function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export interface ComponentDrift {
  name: string;
  problem: 'missing' | 'changed' | 'unlisted';
  file: string;
}

/**
 * Compares `components.json` with `components/*.svelte`: a listed file that
 * is missing or whose hash changed, and a component file nobody listed.
 */
export function componentDrift(
  location: DesignSystemLocation,
  manifest: ComponentsManifest
): ComponentDrift[] {
  if (!location.dir) return [];
  const drift: ComponentDrift[] = [];
  const listed = new Set<string>();
  for (const component of manifest.components) {
    listed.add(component.file);
    const file = join(location.dir, component.file);
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) {
      drift.push({ name: component.name, problem: 'missing', file: component.file });
    } else if (sha256File(file) !== component.sha256) {
      drift.push({ name: component.name, problem: 'changed', file: component.file });
    }
  }
  const dir = join(location.dir, COMPONENTS_DIR);
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    for (const name of readdirSync(dir).sort()) {
      const file = `${COMPONENTS_DIR}/${name}`;
      if (name.endsWith('.svelte') && !listed.has(file)) {
        drift.push({ name: name.replace(/\.svelte$/, ''), problem: 'unlisted', file });
      }
    }
  }
  return drift;
}

/** How to give a design system an allow section (lockability needs one). */
export function allowHint(id: string): string {
  return `add one with \`protoyard ds allow init ${id}\` (or create it with \`protoyard ds new ${id} --allow all\`), then have it approved`;
}

/** Why a design system cannot be locked, or null when it can. */
export function lockRefusal(
  location: DesignSystemLocation,
  document: unknown,
  version: string
): string | null {
  if (location.layout !== 'folder') {
    return `${location.file} is a flat document; run \`protoyard ds migrate ${location.id ?? '<id>'}\` and have it approved first.`;
  }
  if (!readAllow(document)) {
    return `design system "${location.id}" has no allow section, so it cannot be locked; ${allowHint(location.id ?? '<id>')}.`;
  }
  const allow = checkAllow(document);
  if (!allow.ok) {
    return `design system "${location.id}" allows what the Texuli catalog does not list (${allow.errors.slice(0, 3).map(formatIssue).join(', ')}); fix it (\`protoyard ds validate ${location.id}\`).`;
  }
  const approval = readApproval(location, document);
  if (approval?.status !== 'approved') {
    return `design system "${location.id}" is a draft; a designer approves it with \`protoyard ds approve ${location.id} --by <name>\` and a reviewed commit.`;
  }
  if (approval.version !== version) {
    return `design system "${location.id}" was approved at ${approval.version}, but its document is ${version}; approve the new version first.`;
  }
  if (!approval.contentHash) {
    return `design system "${location.id}" has an approval without a content hash; approve it again with \`protoyard ds approve ${location.id} --by <name>\`.`;
  }
  if (approval.contentHash !== contentHash(document)) {
    return `design system "${location.id}" changed after it was approved (content hash mismatch); approve it again.`;
  }
  return null;
}
