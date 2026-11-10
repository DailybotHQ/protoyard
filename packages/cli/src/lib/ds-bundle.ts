import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type DesignSystemBundle,
  designSystemContentHash,
  type PackHistoryEntry,
  type PackLibrarySource,
  packBundle,
  unpackBundle,
} from '@texuli/spec/design-system';
import { depthExceeds } from '@texuli/tools/ds-check';
import type { z } from 'zod';
import {
  COMPONENTS_DIR,
  COMPONENTS_FILE,
  DESIGN_SYSTEMS_DIR,
  type DesignSystemLocation,
  DOCUMENT_FILE,
  isDesignSystemId,
} from './design-systems.ts';
import { dsCatalog, kebabCase, readDocumentApproval } from './ds-catalog.ts';
import {
  ApprovalSchema,
  type BundleFile,
  BundleManifestSchema,
  ComponentRequestSchema,
  ComponentStorySchema,
  type ComponentsManifest,
  ComponentsManifestSchema,
  MAX_BUNDLE_FILE_BYTES,
  MAX_BUNDLE_FILES,
  ReleaseRecordSchema,
} from './ds-contracts.ts';
import { CliError } from './output.ts';
import { hasControlCharacter } from './paths.ts';

/**
 * Portable design-system bundles (PLAN_013 T-bundle): `ds export <id>
 * --bundle` packs a design-system folder into one JSON file, and `ds import
 * <file>` writes it back into another workspace.
 *
 * The format is `protoyard/ds-bundle` version 1 (`BundleManifestSchema` in
 * ds-contracts.ts): Texuli's own bundle (`texuli/design-system-bundle`, from
 * `packBundle`) for the document, the component sources, the allow manifest
 * and the release history, plus a list of every folder file with its hash.
 *
 * A bundle is untrusted input. Import checks it completely before it writes
 * a byte: size and depth caps, Protoyard's schema, Texuli's `validateBundle`,
 * a closed list of file paths (no traversal, no absolute paths, no unknown
 * files, no duplicates, also case-insensitively), every file's SHA-256 and
 * size, each JSON file against its own schema, `components.json` against the
 * component sources, and the document against the Texuli part. Then it
 * writes into a staging folder and renames it into place. Nothing in a
 * bundle is executed, compiled as code or rendered as HTML.
 */

export const BUNDLE_FORMAT = 'protoyard/ds-bundle';
export const BUNDLE_VERSION = 1;
/** The largest bundle file `ds import` reads (8 MiB). */
export const MAX_BUNDLE_BYTES = 8 * 1_048_576;
/** The most bytes the files of one bundle decode to in all (8 MiB). */
export const MAX_BUNDLE_TOTAL_BYTES = 8 * 1_048_576;
/** The deepest a bundle may nest (Texuli's full-validator cap). */
export const MAX_BUNDLE_DEPTH = 64;

const NAME = '[A-Z][A-Za-z0-9]{0,63}';
const SEMVER = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?';

/** The files a design-system folder may hold, and the only paths a bundle may carry. */
const FILE_RULES: readonly { pattern: RegExp; kind: FileKind }[] = [
  { pattern: /^document\.json$/, kind: 'document' },
  { pattern: /^approval\.json$/, kind: 'approval' },
  { pattern: /^components\.json$/, kind: 'components' },
  { pattern: new RegExp(`^components/${NAME}\\.svelte$`), kind: 'component' },
  { pattern: new RegExp(`^requests/${NAME}\\.json$`), kind: 'request' },
  { pattern: new RegExp(`^stories/${NAME}\\.json$`), kind: 'story' },
  { pattern: new RegExp(`^releases/${SEMVER}\\.json$`), kind: 'release' },
];
const FOLDERS = new Set([COMPONENTS_DIR, 'requests', 'stories', 'releases']);

type FileKind =
  | 'document'
  | 'approval'
  | 'components'
  | 'component'
  | 'request'
  | 'story'
  | 'release';

const JSON_SCHEMAS: Partial<Record<FileKind, z.ZodType>> = {
  approval: ApprovalSchema,
  components: ComponentsManifestSchema,
  request: ComponentRequestSchema,
  story: ComponentStorySchema,
  release: ReleaseRecordSchema,
};

export type BundleEnvelope = z.infer<typeof BundleManifestSchema>;

/** One refusal: a stable code, where, and what. */
export interface BundleIssue {
  code: string;
  path: string;
  message: string;
}

function kindOf(path: string): FileKind | null {
  return FILE_RULES.find((rule) => rule.pattern.test(path))?.kind ?? null;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The document as the CLI writes it (two-space JSON and a newline). */
export function documentText(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((part) => Number(part));
  const pb = b.split(/[.-]/).map((part) => Number(part));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return compareText(a, b);
}

function bundleError(message: string, errors: readonly BundleIssue[], hint?: string): CliError {
  return new CliError('validation', message, {
    data: { errors },
    hint:
      hint ??
      errors
        .slice(0, 3)
        .map((e) => `${e.path}: ${e.message}`)
        .join(' · '),
  });
}

function parseJson(text: string, path: string, errors: BundleIssue[]): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    errors.push({ code: 'invalid-json', path, message: (error as Error).message });
    return undefined;
  }
}

function schemaIssues(schema: z.ZodType, value: unknown, path: string): BundleIssue[] {
  const parsed = schema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.slice(0, 5).map((issue) => ({
    code: 'schema',
    path: `${path}${issue.path.length ? `.${issue.path.join('.')}` : ''}`,
    message: issue.message,
  }));
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

interface FolderFile {
  path: string;
  kind: FileKind;
  bytes: Buffer;
  text: string;
}

/** Every file of a folder the bundle may carry, sorted; anything else is skipped and named. */
function folderFiles(dir: string, id: string): { files: FolderFile[]; skipped: string[] } {
  const files: FolderFile[] = [];
  const skipped: string[] = [];
  const refuseLink = (absolute: string, path: string) => {
    if (lstatSync(absolute).isSymbolicLink()) {
      throw new CliError(
        'unsafe_path',
        `design-systems/${id}/${path} is a symlink; a bundle carries regular files only.`,
        { hint: 'Replace the link with the file it points to.' }
      );
    }
  };
  const add = (absolute: string, path: string) => {
    const kind = kindOf(path);
    if (!kind) {
      skipped.push(path);
      return;
    }
    const size = statSync(absolute).size;
    if (size > MAX_BUNDLE_FILE_BYTES) {
      throw new CliError('validation', `design-systems/${id}/${path} is larger than 1 MiB.`);
    }
    const bytes = readFileSync(absolute);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) {
      throw new CliError('validation', `design-systems/${id}/${path} is not UTF-8 text.`);
    }
    files.push({ path, kind, bytes, text });
  };
  for (const name of readdirSync(dir).sort()) {
    const absolute = join(dir, name);
    refuseLink(absolute, name);
    if (statSync(absolute).isDirectory()) {
      if (!FOLDERS.has(name)) {
        skipped.push(`${name}/`);
        continue;
      }
      for (const inner of readdirSync(absolute).sort()) {
        const path = `${name}/${inner}`;
        const innerAbsolute = join(absolute, inner);
        refuseLink(innerAbsolute, path);
        if (statSync(innerAbsolute).isDirectory()) skipped.push(`${path}/`);
        else add(innerAbsolute, path);
      }
    } else {
      add(absolute, name);
    }
  }
  files.sort((a, b) => compareText(a.path, b.path));
  return { files, skipped };
}

export interface ExportedBundle {
  envelope: BundleEnvelope;
  text: string;
  id: string;
  version: string;
  contentHash: string;
  files: { path: string; sha256: string; bytes: number }[];
  /** Folder entries the bundle format does not carry (left out, listed here). */
  skipped: string[];
  components: number;
  history: number;
}

function componentIssues(
  manifest: ComponentsManifest,
  components: ReadonlyMap<string, { sha256: string }>,
  pathOf: (file: string) => string
): BundleIssue[] {
  const issues: BundleIssue[] = [];
  const listed = new Set<string>();
  const ids = new Set<string>();
  for (const component of manifest.components) {
    listed.add(component.file);
    const id = kebabCase(component.name);
    if (ids.has(id)) {
      issues.push({
        code: 'duplicate-component',
        path: pathOf(COMPONENTS_FILE),
        message: `Two components map to the library id "${id}".`,
      });
    }
    ids.add(id);
    const file = components.get(component.file);
    if (!file) {
      issues.push({
        code: 'missing-file',
        path: pathOf(component.file),
        message: `${COMPONENTS_FILE} lists ${component.file}, which is missing.`,
      });
    } else if (file.sha256 !== component.sha256) {
      issues.push({
        code: 'hash-mismatch',
        path: pathOf(component.file),
        message: `${component.file} does not match its sha256 in ${COMPONENTS_FILE}.`,
      });
    }
  }
  for (const file of components.keys()) {
    if (!listed.has(file)) {
      issues.push({
        code: 'unlisted-component',
        path: pathOf(file),
        message: `${file} is not listed in ${COMPONENTS_FILE}.`,
      });
    }
  }
  return issues;
}

/**
 * Packs a design-system folder into a bundle. Refuses a flat document, a
 * symlink, a file that is not UTF-8 or over 1 MiB, a JSON file its schema
 * refuses and component drift (a bundle carries hash-verified sources only).
 */
export function exportBundle(location: DesignSystemLocation): ExportedBundle {
  if (location.layout !== 'folder' || !location.dir || !location.id) {
    throw new CliError('usage', `${location.file} is a flat document; a bundle packs a folder.`, {
      hint: `Run \`protoyard ds migrate ${location.id ?? '<id>'}\` first.`,
    });
  }
  const id = location.id;
  const { files, skipped } = folderFiles(location.dir, id);
  const issues: BundleIssue[] = [];
  const pathOf = (file: string) => `design-systems/${id}/${file}`;
  const parsed = new Map<string, unknown>();
  for (const file of files) {
    if (file.kind === 'component') continue;
    const value = parseJson(file.text, pathOf(file.path), issues);
    if (value === undefined) continue;
    parsed.set(file.path, value);
    const schema = JSON_SCHEMAS[file.kind];
    if (schema) issues.push(...schemaIssues(schema, value, pathOf(file.path)));
  }
  const document = parsed.get(DOCUMENT_FILE);
  if (issues.length > 0) {
    throw bundleError(`design-systems/${id}/ cannot be bundled.`, issues);
  }
  if (document === undefined) {
    throw new CliError('not_found', `design-systems/${id}/ has no ${DOCUMENT_FILE}.`);
  }
  const record = document as Record<string, unknown>;
  if (record.id !== id) {
    throw new CliError(
      'validation',
      `${pathOf(DOCUMENT_FILE)} declares id "${String(record.id)}", but its folder is design-systems/${id}/.`
    );
  }
  const manifest = parsed.get(COMPONENTS_FILE) as ComponentsManifest | undefined;
  const sources = new Map(
    files
      .filter((f) => f.kind === 'component')
      .map((f) => [f.path, { ...f, sha256: sha256(f.bytes) }])
  );
  if (!manifest && sources.size > 0) {
    throw new CliError(
      'validation',
      `design-systems/${id}/ has components but no ${COMPONENTS_FILE}.`
    );
  }
  if (manifest) {
    const drift = componentIssues(manifest, sources, pathOf);
    if (drift.length > 0) {
      throw bundleError(
        `${COMPONENTS_FILE} of design system "${id}" does not match its components.`,
        drift,
        'Run `protoyard ds validate <id>` and fix the drift before you export.'
      );
    }
  }
  const librarySources: PackLibrarySource[] = (manifest?.components ?? []).map((component) => ({
    id: kebabCase(component.name),
    version: component.version,
    language: 'svelte',
    source: sources.get(component.file)?.text ?? '',
  }));
  const libraryIdOf = new Map(
    (manifest?.components ?? []).map((c) => [c.file, kebabCase(c.name)] as const)
  );

  const hash = designSystemContentHash(structuredClone(document));
  const history = new Map<string, PackHistoryEntry>();
  for (const file of files) {
    if (file.kind !== 'release') continue;
    const release = ReleaseRecordSchema.parse(parsed.get(file.path));
    history.set(release.release, {
      version: release.release,
      contentHash: release.contentHash,
      approvedAt: release.approvedAt,
      approvedBy: release.approvedBy,
      status: 'approved',
      ...(release.notes ? { changelog: release.notes } : {}),
    });
  }
  const approval = readDocumentApproval(document);
  const version = String(record.version);
  if (
    approval?.status === 'approved' &&
    approval.version === version &&
    approval.contentHash === hash &&
    !history.has(version)
  ) {
    history.set(version, {
      version,
      contentHash: hash,
      status: 'approved',
      ...(approval.approvedAt ? { approvedAt: approval.approvedAt } : {}),
      ...(approval.approvedBy ? { approvedBy: approval.approvedBy } : {}),
    });
  }
  const catalogHash = dsCatalog().merge?.catalogHash;
  const packed = packBundle({
    document,
    librarySources,
    history: [...history.values()].sort((a, b) => compareSemver(a.version, b.version)),
    ...(catalogHash && /^[0-9a-f]{64}$/.test(catalogHash) ? { catalogDigest: catalogHash } : {}),
    extensions: ['protoyard'],
  });
  if (!packed.ok) {
    throw bundleError(
      `Texuli could not pack design system "${id}".`,
      packed.errors.map((e) => ({ code: e.code, path: e.path, message: e.message }))
    );
  }
  // Texuli checks cross-field rules (a history entry for the packed version
  // must match the document) only when it validates; refuse here, not on import.
  const checked = unpackBundle(packed.bundle);
  if (!checked.ok) {
    throw bundleError(
      `Texuli refuses the bundle of design system "${id}".`,
      checked.errors.map((e) => ({ code: e.code, path: e.path, message: e.message }))
    );
  }

  const entries: BundleFile[] = files.map((file) => {
    const base = { path: file.path, sha256: sha256(file.bytes), bytes: file.bytes.length };
    if (file.kind === 'document' && documentText(document) === file.text) {
      return { ...base, from: 'document' };
    }
    const libraryId = file.kind === 'component' ? libraryIdOf.get(file.path) : undefined;
    if (libraryId) return { ...base, from: `library:${libraryId}` };
    return { ...base, text: file.text };
  });
  if (entries.length > MAX_BUNDLE_FILES) {
    throw new CliError('validation', `A bundle carries at most ${MAX_BUNDLE_FILES} files.`);
  }
  const envelope: BundleEnvelope = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    designSystem: id,
    release: version,
    contentHash: hash,
    texuli: packed.bundle as unknown as Record<string, unknown>,
    files: entries,
  };
  const text = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > MAX_BUNDLE_BYTES) {
    throw new CliError('validation', `The bundle of "${id}" is larger than 8 MiB.`);
  }
  return {
    envelope,
    text,
    id,
    version,
    contentHash: hash,
    files: entries.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes })),
    skipped,
    components: librarySources.length,
    history: history.size,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** A bundle checked end to end: what import would write. */
export interface CheckedBundle {
  id: string;
  version: string;
  contentHash: string;
  document: Record<string, unknown>;
  /** Folder files by path, sorted, with their bytes. */
  files: { path: string; bytes: Buffer; sha256: string }[];
  texuli: DesignSystemBundle;
}

/**
 * Reads a bundle file: a regular file (never a symlink) of at most 8 MiB,
 * parsed as JSON. An absolute path is read where it is; a relative one from
 * the workspace root.
 */
export function readBundleFile(file: string): { value: unknown; sha256: string } {
  if (hasControlCharacter(file)) throw new CliError('unsafe_path', 'Unsafe bundle path.');
  if (!existsSync(file)) throw new CliError('not_found', `No such file: ${file}.`);
  const info = lstatSync(file);
  if (info.isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to read the bundle through a symlink: ${file}.`);
  }
  if (!info.isFile()) throw new CliError('usage', `${file} is not a file.`);
  if (info.size > MAX_BUNDLE_BYTES) {
    throw bundleError(`${file} is larger than 8 MiB.`, [
      { code: 'too-large', path: '$', message: `A bundle is at most ${MAX_BUNDLE_BYTES} bytes.` },
    ]);
  }
  const bytes = readFileSync(file);
  const errors: BundleIssue[] = [];
  const value = parseJson(bytes.toString('utf8'), '$', errors);
  if (errors.length > 0) throw bundleError(`${file} is not JSON.`, errors);
  return { value, sha256: sha256(bytes) };
}

/**
 * Checks an untrusted bundle value completely and resolves every file's
 * bytes. Throws a `validation` CliError listing every refusal (code, path,
 * message); writes nothing.
 */
export function checkBundle(value: unknown): CheckedBundle {
  if (depthExceeds(value, MAX_BUNDLE_DEPTH)) {
    throw bundleError('The bundle nests too deep.', [
      {
        code: 'too-deep',
        path: '$',
        message: `A bundle nests at most ${MAX_BUNDLE_DEPTH} levels.`,
      },
    ]);
  }
  const envelope = BundleManifestSchema.safeParse(value);
  if (!envelope.success) {
    throw bundleError(
      `Not a ${BUNDLE_FORMAT} bundle (version ${BUNDLE_VERSION}).`,
      schemaIssues(BundleManifestSchema, value, '$')
    );
  }
  const bundle = envelope.data;
  const unpacked = unpackBundle(bundle.texuli);
  if (!unpacked.ok) {
    throw bundleError(
      'Texuli refuses the design-system bundle inside.',
      unpacked.errors.map((e) => ({
        code: e.code,
        path: `$.texuli${e.path.startsWith('$') ? e.path.slice(1) : `.${e.path}`}`,
        message: e.message,
      }))
    );
  }
  const issues: BundleIssue[] = [];
  const document = unpacked.document as unknown as Record<string, unknown>;
  const hash = designSystemContentHash(structuredClone(document));
  if (document.id !== bundle.designSystem || !isDesignSystemId(String(document.id))) {
    issues.push({
      code: 'id-mismatch',
      path: '$.designSystem',
      message: `The bundle names "${bundle.designSystem}", its document "${String(document.id)}".`,
    });
  }
  if (document.version !== bundle.release) {
    issues.push({
      code: 'version-mismatch',
      path: '$.release',
      message: `The bundle names ${bundle.release}, its document ${String(document.version)}.`,
    });
  }
  if (bundle.contentHash !== hash) {
    issues.push({
      code: 'content-hash-mismatch',
      path: '$.contentHash',
      message: 'The recorded contentHash does not match the document.',
    });
  }

  const sources = new Map<string, string>();
  for (const [index, source] of unpacked.librarySources.entries()) {
    if (sources.has(source.id)) {
      issues.push({
        code: 'duplicate-source',
        path: `$.texuli.librarySources[${index}].id`,
        message: `Two library sources have the id "${source.id}".`,
      });
    }
    sources.set(source.id, source.source);
  }

  const seen = new Set<string>();
  const used = new Set<string>();
  const files: CheckedBundle['files'] = [];
  let total = 0;
  for (const [index, file] of bundle.files.entries()) {
    const at = `$.files[${index}]`;
    const kind = kindOf(file.path);
    if (!kind) {
      issues.push({
        code: 'unknown-file',
        path: `${at}.path`,
        message: `"${file.path}" is not a design-system file.`,
      });
      continue;
    }
    const folded = file.path.toLowerCase();
    if (seen.has(folded)) {
      issues.push({
        code: 'duplicate-file',
        path: `${at}.path`,
        message: `"${file.path}" appears twice (names are compared case-insensitively).`,
      });
      continue;
    }
    seen.add(folded);
    let text: string | undefined = file.text;
    if (file.from === 'document') {
      if (kind !== 'document') {
        issues.push({
          code: 'bad-reference',
          path: `${at}.from`,
          message: 'Only document.json comes from the document.',
        });
        continue;
      }
      text = documentText(document);
    } else if (file.from?.startsWith('library:')) {
      const id = file.from.slice('library:'.length);
      if (kind !== 'component' || !sources.has(id)) {
        issues.push({
          code: 'bad-reference',
          path: `${at}.from`,
          message: `"${file.from}" does not name a library source of a component file.`,
        });
        continue;
      }
      used.add(id);
      text = sources.get(id);
    }
    const bytes = Buffer.from(text ?? '', 'utf8');
    total += bytes.length;
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
      issues.push({
        code: 'hash-mismatch',
        path: at,
        message: `${file.path} does not match its recorded sha256 and size.`,
      });
      continue;
    }
    files.push({ path: file.path, bytes, sha256: file.sha256 });
  }
  if (total > MAX_BUNDLE_TOTAL_BYTES) {
    issues.push({
      code: 'too-large',
      path: '$.files',
      message: 'The files decode to more than 8 MiB.',
    });
  }
  for (const id of sources.keys()) {
    if (!used.has(id)) {
      issues.push({
        code: 'unreferenced-source',
        path: '$.texuli.librarySources',
        message: `The library source "${id}" belongs to no component file.`,
      });
    }
  }
  if (issues.length > 0) throw bundleError('The bundle is not consistent.', issues);

  // Each file against its own contract, the document against the Texuli part,
  // and components.json against the component files.
  const byPath = new Map(files.map((f) => [f.path, f]));
  const documentFile = byPath.get(DOCUMENT_FILE);
  if (!documentFile) {
    issues.push({
      code: 'missing-file',
      path: '$.files',
      message: `The bundle has no ${DOCUMENT_FILE}.`,
    });
  }
  let manifest: ComponentsManifest | undefined;
  for (const file of files) {
    const kind = kindOf(file.path) as FileKind;
    if (kind === 'component') continue;
    const value = parseJson(file.bytes.toString('utf8'), file.path, issues);
    if (value === undefined) continue;
    if (kind === 'document') {
      if (
        designSystemContentHash(structuredClone(value)) !== hash ||
        JSON.stringify(readDocumentApproval(value)) !==
          JSON.stringify(readDocumentApproval(document))
      ) {
        issues.push({
          code: 'document-mismatch',
          path: file.path,
          message: `${DOCUMENT_FILE} is not the document Texuli's bundle carries.`,
        });
      }
      continue;
    }
    const schema = JSON_SCHEMAS[kind];
    if (schema) issues.push(...schemaIssues(schema, value, file.path));
    if (kind === 'components' && ComponentsManifestSchema.safeParse(value).success) {
      manifest = value as ComponentsManifest;
    }
    if (kind === 'release') {
      const release = ReleaseRecordSchema.safeParse(value);
      if (release.success && release.data.designSystem !== bundle.designSystem) {
        issues.push({
          code: 'id-mismatch',
          path: `${file.path}.designSystem`,
          message: `The release names "${release.data.designSystem}".`,
        });
      }
    }
  }
  const components = new Map(
    files.filter((f) => kindOf(f.path) === 'component').map((f) => [f.path, f])
  );
  if (manifest) {
    issues.push(...componentIssues(manifest, components, (p) => p));
    for (const component of manifest.components) {
      const source = sources.get(kebabCase(component.name));
      const file = components.get(component.file);
      if (file && source !== undefined && file.bytes.toString('utf8') !== source) {
        issues.push({
          code: 'source-mismatch',
          path: component.file,
          message: `${component.file} is not the library source "${kebabCase(component.name)}".`,
        });
      }
    }
  } else if (components.size > 0) {
    issues.push({
      code: 'missing-file',
      path: '$.files',
      message: `The bundle has components but no ${COMPONENTS_FILE}.`,
    });
  }
  if (issues.length > 0) throw bundleError('The bundle is not consistent.', issues);
  return {
    id: bundle.designSystem,
    version: bundle.release,
    contentHash: hash,
    document,
    files,
    texuli: unpacked.bundle,
  };
}

/** The draft approval `ds import --draft` writes (the content hash covers no approval). */
export function draftApproval(version: string): Record<string, unknown> {
  return { status: 'draft', version };
}

/**
 * Writes the checked files into `design-systems/<id>/`: first into a hidden
 * staging folder next to it (`.<id>.import-<random>`, skipped by the index),
 * then a rename. With `replace`, the existing folder moves aside, the staging
 * folder takes its place, and the old one is removed; on failure the old one
 * is moved back. Refuses a symlinked `design-systems/` or target.
 */
export function writeImport(
  root: string,
  id: string,
  files: readonly { path: string; bytes: Buffer }[],
  replace: boolean
): string {
  const parent = join(root, DESIGN_SYSTEMS_DIR);
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
    throw new CliError(
      'unsafe_path',
      `Refusing to write through the symlink ${DESIGN_SYSTEMS_DIR}/.`
    );
  }
  mkdirSync(parent, { recursive: true });
  const target = join(parent, id);
  const flat = join(parent, `${id}.json`);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    throw new CliError(
      'unsafe_path',
      `Refusing to replace the symlink ${DESIGN_SYSTEMS_DIR}/${id}.`
    );
  }
  if (existsSync(flat)) {
    throw new CliError(
      'conflict',
      `${DESIGN_SYSTEMS_DIR}/${id}.json already exists (a flat design system).`,
      {
        hint: 'Remove or rename it, or pass --id <id> to import under another id.',
      }
    );
  }
  if (existsSync(target) && !replace) {
    throw new CliError('conflict', `Design system "${id}" already exists.`, {
      hint: 'Pass --force to replace it, or --id <id> to import it under another id.',
    });
  }
  const suffix = randomBytes(6).toString('hex');
  const staging = join(parent, `.${id}.import-${suffix}`);
  mkdirSync(staging);
  try {
    for (const file of files) {
      const absolute = join(staging, ...file.path.split('/'));
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, file.bytes, { flag: 'wx' });
    }
    if (existsSync(target)) {
      const aside = join(parent, `.${id}.replaced-${suffix}`);
      renameSync(target, aside);
      try {
        renameSync(staging, target);
      } catch (error) {
        renameSync(aside, target);
        throw error;
      }
      rmSync(aside, { recursive: true, force: true });
    } else {
      renameSync(staging, target);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return `${DESIGN_SYSTEMS_DIR}/${id}`;
}
