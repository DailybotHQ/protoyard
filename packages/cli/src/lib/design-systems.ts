import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
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
 *   document.json      the Texuli design-system document
 *   approval.json      status, version, approvedBy, approvedAt, contentHash
 *   components.json    the design system's own components, with source hashes
 *   components/*.svelte
 * ```
 *
 * Only a folder can be approved, and only an approved folder can be locked.
 * The approval is a record, not a proof: the CLI cannot tell who ran
 * `ds approve`. A human commit reviewed through CODEOWNERS is the guarantee.
 */

export const DESIGN_SYSTEMS_DIR = 'design-systems';
export const DOCUMENT_FILE = 'document.json';
export const APPROVAL_FILE = 'approval.json';
export const COMPONENTS_FILE = 'components.json';
export const COMPONENTS_DIR = 'components';
/** Texuli's import cap for JSON text (1 MiB). */
export const MAX_DOCUMENT_BYTES = 1_048_576;

const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export const ApprovalSchema = z
  .object({
    status: z.enum(['draft', 'approved']),
    version: z.string().regex(SEMVER),
    approvedBy: z.string().min(1).max(120).optional(),
    approvedAt: z.iso.datetime().optional(),
    contentHash: z.string().regex(SHA256).optional(),
  })
  .strict();
export type Approval = z.infer<typeof ApprovalSchema>;

export const LibraryComponentSchema = z
  .object({
    name: z.string().regex(COMPONENT_NAME),
    purpose: z.string().min(1).max(280),
    version: z.string().regex(SEMVER),
    status: z.enum(['draft', 'approved']),
    /** `components/<Name>.svelte`, relative to the design-system folder. */
    file: z.string().regex(/^components\/[A-Z][A-Za-z0-9]{0,63}\.svelte$/),
    sha256: z.string().regex(SHA256),
    approvedBy: z.string().min(1).max(120).optional(),
    approvedAt: z.iso.datetime().optional(),
  })
  .strict();
export type LibraryComponent = z.infer<typeof LibraryComponentSchema>;

export const ComponentsManifestSchema = z
  .object({
    format: z.literal('protoyard/ds-components'),
    version: z.literal(1),
    components: z.array(LibraryComponentSchema).max(500),
  })
  .strict();
export type ComponentsManifest = z.infer<typeof ComponentsManifestSchema>;

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
      `Could not read ${location.file}: ${error instanceof Error ? error.message : String(error)}`
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
    throw new CliError('validation', `Could not read ${label}: ${(error as Error).message}`);
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

export function readApproval(location: DesignSystemLocation): Approval | null {
  if (!location.dir) return null;
  return readJsonFile(
    join(location.dir, APPROVAL_FILE),
    `design-systems/${location.id}/${APPROVAL_FILE}`,
    ApprovalSchema
  );
}

export function readComponents(location: DesignSystemLocation): ComponentsManifest | null {
  if (!location.dir) return null;
  return readJsonFile(
    join(location.dir, COMPONENTS_FILE),
    `design-systems/${location.id}/${COMPONENTS_FILE}`,
    ComponentsManifestSchema
  );
}

/** JSON with sorted keys and no whitespace, so equal documents hash equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Approval data never counts toward the content it approves: Texuli's spec
 * 0.13.0 leaves out the whole `approval` section (ADR-032 there); the flat
 * fields are dropped too so an interim sidecar hash keeps matching.
 */
const APPROVAL_KEYS = new Set(['approval', 'status', 'approvedBy', 'approvedAt', 'contentHash']);

/**
 * SHA-256 of the canonical JSON of a document without approval fields
 * (the scheme agreed with Texuli for the 0.13.0 spec).
 */
export function contentHash(document: unknown): string {
  const stripped =
    document && typeof document === 'object' && !Array.isArray(document)
      ? Object.fromEntries(
          Object.entries(document as Record<string, unknown>).filter(
            ([key]) => !APPROVAL_KEYS.has(key)
          )
        )
      : document;
  return createHash('sha256').update(canonicalJson(stripped)).digest('hex');
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

/** Why a design system cannot be locked, or null when it can. */
export function lockRefusal(
  location: DesignSystemLocation,
  document: unknown,
  version: string
): string | null {
  if (location.layout !== 'folder') {
    return `${location.file} is a flat document; run \`protoyard ds migrate ${location.id ?? '<id>'}\` and have it approved first.`;
  }
  const approval = readApproval(location);
  if (approval?.status !== 'approved') {
    return `design system "${location.id}" is a draft; a designer approves it with \`protoyard ds approve ${location.id}\` and a reviewed commit.`;
  }
  if (approval.version !== version) {
    return `design system "${location.id}" was approved at ${approval.version}, but its document is ${version}; approve the new version first.`;
  }
  if (approval.contentHash && approval.contentHash !== contentHash(document)) {
    return `design system "${location.id}" changed after it was approved (content hash mismatch); approve it again.`;
  }
  return null;
}
