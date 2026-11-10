import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { compileDesignSystemDocument } from '@protoyard/themes';
import {
  changesModel,
  KIT_ALLOW_LISTS,
  type KitAllowChange,
  type KitAllowList,
  type KitApprovalChange,
  kitApproval,
} from '@texuli/spec/design-system';
import { type DesignSystemDiff, diffDesignSystems } from '@texuli/tokens/design-system/diff';
import { biomeJson } from './codegen/format.ts';
import {
  contentHash,
  DESIGN_SYSTEMS_DIR,
  type DesignSystemLocation,
  readComponents,
} from './design-systems.ts';
import { readDocumentApproval, readLibrary } from './ds-catalog.ts';
import { checkText } from './ds-components.ts';
import { MAX_CHANGELOG, type ReleaseRecord, ReleaseRecordSchema } from './ds-contracts.ts';
import { jsonErrorText } from './json-error.ts';
import { CliError } from './output.ts';

/**
 * Design-system releases (PLAN_013 T-versions): immutable snapshots of an
 * approved version in `design-systems/<id>/releases/<version>.json`, and the
 * comparison of two versions.
 *
 * - A release is written once (`ds approve --release`, `ds release`) and
 *   never rewritten; a new version is a new file.
 * - The record keeps the whole document as approved, so a later document can
 *   be compared with it. Its `contentHash` is Texuli's hash of that document.
 * - Token changes come from Texuli's `diffDesignSystems`
 *   (`@texuli/tokens/design-system/diff`) over both compiled versions. The
 *   allow and approval changes are Texuli's `changesModel`
 *   (`@texuli/spec/design-system`, the model the kit's Changes section
 *   renders); the library changes keep the `KitLibraryChange` shape but
 *   compare every field.
 */

export const RELEASES_DIR = 'releases';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
/** A release holds a document (at most 1 MiB) and a little metadata. */
const MAX_RELEASE_BYTES = 2 * 1_048_576;

export function isSemver(value: string): boolean {
  return SEMVER.test(value);
}

/** Semver precedence: numeric parts, then a release above its prereleases. */
export function compareSemver(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  const ra = pa[4];
  const rb = pb[4];
  if (ra === rb) return 0;
  if (ra === undefined) return 1;
  if (rb === undefined) return -1;
  const xa = ra.split('.');
  const xb = rb.split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const x = xa[i];
    const y = xb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny && Number(x) !== Number(y)) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function folderOf(location: DesignSystemLocation): string {
  if (location.layout !== 'folder' || !location.dir || !location.id) {
    throw new CliError(
      'validation',
      `${location.file} is a flat document; only a folder keeps releases.`,
      { hint: `Run \`protoyard ds migrate ${location.id ?? '<id>'}\` first.` }
    );
  }
  return location.dir;
}

/** Workspace-relative path of one release file. */
export function releaseLabel(id: string, version: string): string {
  return `${DESIGN_SYSTEMS_DIR}/${id}/${RELEASES_DIR}/${version}.json`;
}

function checkVersion(version: string): string {
  if (!isSemver(version)) {
    throw new CliError('usage', `"${version}" is not an exact semver version (1.2.0).`);
  }
  return version;
}

/**
 * Reads `releases/<version>.json` against its contract, or null when there is
 * none. Throws `validation` on a file the contract refuses, `unsafe_path` on
 * a symlink. Consistency (hash, id, version) is {@link releaseProblems}.
 */
export function readRelease(location: DesignSystemLocation, version: string): ReleaseRecord | null {
  const dir = folderOf(location);
  checkVersion(version);
  const label = releaseLabel(location.id as string, version);
  const file = join(dir, RELEASES_DIR, `${version}.json`);
  if (!existsSync(file)) return null;
  if (lstatSync(file).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to read ${label} through a symlink.`);
  }
  if (statSync(file).size > MAX_RELEASE_BYTES) {
    throw new CliError('validation', `${label} is larger than 2 MiB.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CliError('validation', `Could not read ${label}: it is ${jsonErrorText(error)}.`);
  }
  const parsed = ReleaseRecordSchema.safeParse(raw);
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

/** What is inconsistent in a release record that passed its schema. */
export function releaseProblems(record: ReleaseRecord, id: string, version: string): string[] {
  const problems: string[] = [];
  if (record.designSystem !== id) {
    problems.push(`names design system "${record.designSystem}", not "${id}"`);
  }
  if (record.release !== version) {
    problems.push(`records ${record.release}, but its file is ${version}.json`);
  }
  if (record.document.version !== record.release) {
    problems.push(`holds a document at version ${String(record.document.version)}`);
  }
  if (record.document.id !== id) {
    problems.push(`holds the document of "${String(record.document.id)}"`);
  }
  if (contentHash(record.document) !== record.contentHash) {
    problems.push('its document does not match its contentHash');
  }
  return problems;
}

export interface ReleaseIssue {
  file: string;
  message: string;
}

export interface ReleaseList {
  /** Valid, consistent releases, oldest first. */
  releases: ReleaseRecord[];
  issues: ReleaseIssue[];
}

/** Every release of a folder, oldest first; anything unreadable is an issue, never a throw. */
export function listReleases(location: DesignSystemLocation): ReleaseList {
  const dir = join(folderOf(location), RELEASES_DIR);
  const id = location.id as string;
  const releases: ReleaseRecord[] = [];
  const issues: ReleaseIssue[] = [];
  if (!existsSync(dir)) return { releases, issues };
  const base = `${DESIGN_SYSTEMS_DIR}/${id}/${RELEASES_DIR}`;
  if (lstatSync(dir).isSymbolicLink() || !statSync(dir).isDirectory()) {
    return { releases, issues: [{ file: base, message: 'is not a plain folder' }] };
  }
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const version = name.endsWith('.json') ? name.slice(0, -'.json'.length) : '';
    if (!isSemver(version)) {
      issues.push({ file: `${base}/${name}`, message: 'is not named <semver>.json' });
      continue;
    }
    try {
      const record = readRelease(location, version);
      if (!record) continue;
      const problems = releaseProblems(record, id, version);
      if (problems.length > 0) {
        issues.push({ file: `${base}/${name}`, message: problems.join('; ') });
        continue;
      }
      releases.push(record);
    } catch (error) {
      issues.push({ file: `${base}/${name}`, message: (error as Error).message });
    }
  }
  releases.sort((a, b) => compareSemver(a.release, b.release));
  return { releases, issues };
}

/** A release-ready approval of `document`, or the reason it is not one. */
export function releaseRefusal(id: string, document: unknown): string | null {
  const approval = readDocumentApproval(document);
  const version = (document as { version?: unknown })?.version;
  if (approval?.status !== 'approved') {
    return `design system "${id}" is not approved; approve it first (\`protoyard ds approve ${id} --by <name>\`).`;
  }
  if (approval.version !== version) {
    return `design system "${id}" was approved at ${approval.version}, but the document is ${String(version)}; approve this version first.`;
  }
  if (kitApproval(document).hash !== 'matches') {
    return `design system "${id}" changed after its approval; approve it again before releasing it.`;
  }
  if (!approval.approvedBy || !approval.approvedAt) {
    return `the approval of "${id}" has no approvedBy or approvedAt; approve it again with \`protoyard ds approve ${id} --by <name>\`.`;
  }
  return null;
}

/** Checks a `--changelog` value: one line, at most {@link MAX_CHANGELOG} characters. */
export function checkChangelog(value: string | undefined): string | undefined {
  return value === undefined ? undefined : checkText(value, '--changelog', MAX_CHANGELOG);
}

/** Throws `conflict` when `releases/<version>.json` already exists. */
export function assertNoRelease(location: DesignSystemLocation, version: string): void {
  const dir = folderOf(location);
  checkVersion(version);
  const file = join(dir, RELEASES_DIR, `${version}.json`);
  if (existsSync(file)) {
    throw new CliError(
      'conflict',
      `${releaseLabel(location.id as string, version)} already exists; a release is never rewritten.`,
      { hint: 'Bump the document version, approve it, and release the new version.' }
    );
  }
}

/**
 * Builds the release record of an approved document: the document as it is,
 * its hash, who approved it and when, the `components.json` entries, and a
 * changelog (the given text, or a summary of the changes since the previous
 * release). Refuses a document that is not approved at its version.
 */
export async function buildRelease(
  location: DesignSystemLocation,
  document: unknown,
  changelog?: string
): Promise<{ record: ReleaseRecord; previous: ReleaseRecord | null }> {
  folderOf(location);
  const id = location.id as string;
  const refusal = releaseRefusal(id, document);
  if (refusal) throw new CliError('validation', `Cannot release: ${refusal}`);
  const approval = readDocumentApproval(document);
  const version = String((document as { version: unknown }).version);
  const { releases } = listReleases(location);
  const previous =
    [...releases].reverse().find((r) => compareSemver(r.release, version) < 0) ?? null;
  const text =
    changelog ??
    (previous
      ? `Changes since ${previous.release}: ${changeSummary(
          await diffVersions(
            { label: previous.release, document: previous.document },
            { label: version, document }
          )
        )}.`
      : `First release of ${id} (${version}).`);
  const record: ReleaseRecord = {
    format: 'protoyard/ds-release',
    version: 1,
    designSystem: id,
    release: version,
    contentHash: contentHash(document),
    approvedBy: approval?.approvedBy as string,
    approvedAt: approval?.approvedAt as string,
    changelog: text.slice(0, MAX_CHANGELOG),
    components: (readComponents(location)?.components ?? []).map((c) => ({
      name: c.name,
      version: c.version,
      sha256: c.sha256,
    })),
    document: structuredClone(document) as Record<string, unknown>,
  };
  const parsed = ReleaseRecordSchema.safeParse(record);
  if (!parsed.success) {
    throw new CliError('validation', `The release record of ${id}@${version} is not valid.`, {
      hint: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join(' · '),
    });
  }
  return { record: parsed.data, previous };
}

/** Writes a new release file; refuses to replace one (`wx`), never follows a symlink. */
/**
 * Every refusal `writeRelease` would make, without writing: run it before
 * anything else changes (`ds approve --release` checks it before it writes
 * the approved document).
 */
export function assertReleaseWritable(location: DesignSystemLocation, version: string): void {
  const dir = join(folderOf(location), RELEASES_DIR);
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) {
    const label = releaseLabel(location.id as string, version);
    throw new CliError('unsafe_path', `Refusing to write ${label} through a symlink.`);
  }
  assertNoRelease(location, version);
}

export function writeRelease(location: DesignSystemLocation, record: ReleaseRecord): string {
  const dir = join(folderOf(location), RELEASES_DIR);
  const label = releaseLabel(location.id as string, record.release);
  assertReleaseWritable(location, record.release);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, `${record.release}.json`), biomeJson(record), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      assertNoRelease(location, record.release);
    throw error;
  }
  return label;
}

/**
 * The release a version is compared with: for the current document, the
 * newest release (at or below its version) whose content differs from it;
 * for a release, the newest release below it.
 */
export function baselineRelease(
  releases: readonly ReleaseRecord[],
  target: { version: string; contentHash: string; current: boolean }
): ReleaseRecord | null {
  const older = [...releases].reverse();
  if (!target.current)
    return older.find((r) => compareSemver(r.release, target.version) < 0) ?? null;
  return (
    older.find(
      (r) => compareSemver(r.release, target.version) <= 0 && r.contentHash !== target.contentHash
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Comparing two versions

/** The allow lists of one component (Texuli's `KIT_ALLOW_LISTS`). */
export const ALLOW_LISTS = KIT_ALLOW_LISTS;
export type AllowList = KitAllowList;

/** Texuli's `KitAllowChange` (`changesModel` of `@texuli/spec/design-system`). */
export type AllowChange = KitAllowChange;

export interface LibraryChange {
  kind: 'added' | 'removed' | 'changed';
  id: string;
  fields?: { field: string; before?: string; after?: string }[];
}

/** Texuli's `KitApprovalChange`. */
export type ApprovalChange = KitApprovalChange;

export interface VersionsDiff {
  from: string;
  to: string;
  fromHash: string;
  toHash: string;
  /** Texuli's `diffDesignSystems` over both compiled versions. */
  tokens: DesignSystemDiff;
  /** Texuli's `changesModel(...).allow`. */
  allow: readonly AllowChange[];
  /** Every field of every library entry (Texuli's `changesModel` compares fewer; see `diffLibrary`). */
  library: LibraryChange[];
  /** Texuli's `changesModel(...).approval`. */
  approval: readonly ApprovalChange[];
  /** The content (the document without its approvals) changed. */
  contentChanged: boolean;
  /** Nothing changed in any part compared. */
  identical: boolean;
}

export interface VersionSide {
  /** `current` or a release version. */
  label: string;
  document: unknown;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const text = (value: unknown): string | undefined =>
  value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value);

/**
 * Library changes, every field of each entry, each field's value as JSON
 * text (the `ds diff --json` shape since 1.8). Texuli 0.17.1's
 * `changesModel` now compares an entry's approver, version and content hash
 * too, but not `approval.approvedAt` or fields outside its list, it clips
 * values at 200 characters and reads the first 64 entries, and it reports
 * `approval.<field>` rows instead of one `approval` row; this keeps the
 * complete comparison and the stable shape.
 */
function diffLibrary(before: unknown, after: unknown): LibraryChange[] {
  const a = new Map(
    readLibrary(before).map((e) => [e.id, e as unknown as Record<string, unknown>])
  );
  const b = new Map(readLibrary(after).map((e) => [e.id, e as unknown as Record<string, unknown>]));
  const out: LibraryChange[] = [];
  for (const id of [...new Set([...a.keys(), ...b.keys()])].sort(byText)) {
    const x = a.get(id);
    const y = b.get(id);
    if (!x) out.push({ kind: 'added', id });
    else if (!y) out.push({ kind: 'removed', id });
    else {
      const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])]
        .sort(byText)
        .filter((field) => text(x[field]) !== text(y[field]))
        .map((field) => {
          const was = text(x[field]);
          const now = text(y[field]);
          return {
            field,
            ...(was !== undefined ? { before: was } : {}),
            ...(now !== undefined ? { after: now } : {}),
          };
        });
      if (fields.length > 0) out.push({ kind: 'changed', id, fields });
    }
  }
  return out;
}

async function compiled(side: VersionSide) {
  const result = await compileDesignSystemDocument(side.document);
  if (!result.ok) {
    throw new CliError(
      'validation',
      `${side.label} does not compile: ${result.errors.slice(0, 3).join('; ')}`
    );
  }
  return result.compiled;
}

/** What changed from `from` to `to`: tokens (Texuli), allow, library, approval. */
export async function diffVersions(from: VersionSide, to: VersionSide): Promise<VersionsDiff> {
  const tokens = diffDesignSystems(await compiled(from), await compiled(to));
  // Allow and approval changes are Texuli's (the kit's Changes section renders the same model).
  const { allow, approval } = changesModel({ document: from.document }, { document: to.document });
  const library = diffLibrary(from.document, to.document);
  const fromHash = contentHash(from.document);
  const toHash = contentHash(to.document);
  const contentChanged = fromHash !== toHash;
  return {
    from: from.label,
    to: to.label,
    fromHash,
    toHash,
    tokens,
    allow,
    library,
    approval,
    contentChanged,
    identical:
      tokens.identical &&
      allow.length === 0 &&
      library.length === 0 &&
      approval.length === 0 &&
      !contentChanged,
  };
}

/** One line of counts for a changelog entry or a terminal summary. */
export function changeSummary(diff: VersionsDiff): string {
  if (!diff.contentChanged) return 'no content changes';
  const parts: string[] = [];
  const { added, removed, changed, regressions } = diff.tokens.summary;
  if (added + removed + changed > 0) {
    parts.push(`tokens ${changed} changed, ${added} added, ${removed} removed`);
  }
  if (regressions > 0) parts.push(`${regressions} contrast regressions`);
  if (diff.tokens.defaults.length > 0)
    parts.push(`${diff.tokens.defaults.length} component defaults`);
  if (diff.allow.length > 0) {
    const count = (kind: AllowChange['kind']) => diff.allow.filter((c) => c.kind === kind).length;
    parts.push(
      `allow ${count('added')} added, ${count('removed')} removed, ${count('changed')} lists changed${
        count('locked') ? ', now locked' : count('unlocked') ? ', now unlocked' : ''
      }`
    );
  }
  if (diff.library.length > 0) {
    const count = (kind: LibraryChange['kind']) =>
      diff.library.filter((c) => c.kind === kind).length;
    parts.push(
      `library ${count('added')} added, ${count('removed')} removed, ${count('changed')} changed`
    );
  }
  return parts.length > 0
    ? parts.join('; ')
    : 'document fields changed (no tokens, allow or library)';
}
