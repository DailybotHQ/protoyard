import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Blueprint,
  BrandThemeError,
  diffBlueprints,
  latestSchemaVersion,
  MigrationError,
  safeParseBlueprint,
} from '@protoyard/blueprint';
import { CliError } from '../output.ts';
import { type EmittedFile, emitPrototype } from './emit.ts';
import { formatJson } from './format.ts';
import { checkHeader } from './header.ts';

/**
 * Regeneration and drift detection for blueprint-generated prototypes.
 *
 * `src/generated/blueprint.snapshot.json` records the blueprint the generated
 * code currently reflects (and its schema version), so a blueprint edited in
 * place can still be diffed against what was generated. blueprint.json keeps
 * the `history` of earlier blueprints, from which every database version is
 * rebuilt (`deriveDatabaseVersions`). Everything here reads JSON and hashes
 * files: no prototype code runs (ADR-003).
 */

export const SNAPSHOT_PATH = 'src/generated/blueprint.snapshot.json';
export const CODEGEN_FORMAT_VERSION = 2;
const SCREENS_DIR = 'src/generated/screens';

export interface Snapshot {
  /** Generated source layout version; absent snapshots predate screen codegen. */
  codegenFormat?: number;
  schemaVersion: number;
  blueprint: Record<string, unknown>;
}

export type FileStatus = 'created' | 'changed' | 'unchanged' | 'conflicted' | 'removed' | 'skipped';

export interface FilePlan {
  path: string;
  status: FileStatus;
  /** Present for created / changed / conflicted (written with --force). */
  content?: string;
}

export const withoutHistory = (raw: Record<string, unknown>) => {
  const { history: _history, ...rest } = raw;
  return rest;
};

export const snapshotText = (snapshot: Snapshot) => formatJson(snapshot);

const readText = (path: string) => readFile(path, 'utf8').catch(() => null);

/** JSON equality on parsed values (key order matters, like the files on disk). */
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameJsonText = (a: string, b: string) => {
  try {
    return sameJson(JSON.parse(a), JSON.parse(b));
  } catch {
    return a === b;
  }
};

function parseOrThrow(raw: unknown, label: string): Blueprint {
  const parsed = safeParseBlueprint(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new CliError(
    'validation',
    `${label} is invalid: ${issue ? `${issue.path.map(String).join('.') || '(root)'} — ${issue.message}` : 'unknown error'}`
  );
}

/** `emitPrototype`, with brand-theme errors (contrast, unknown ids) reported as validation errors (exit 4). */
export function emitOrThrow(
  blueprint: Blueprint,
  slug: string,
  blueprintText: string
): EmittedFile[] {
  try {
    return emitPrototype(blueprint, slug, blueprintText);
  } catch (error) {
    if (error instanceof BrandThemeError) {
      throw new CliError('validation', error.message, {
        hint:
          error.failures.length > 0
            ? 'Adjust brand.seed / preset / styleProfile so text pairs reach WCAG AA 4.5:1.'
            : 'Fix the brand block (`pnpm protoyard theme list` shows the library ids).',
        data: { failures: error.failures },
      });
    }
    throw error;
  }
}

export async function readSnapshot(dest: string): Promise<Snapshot | null> {
  const text = await readText(join(dest, SNAPSHOT_PATH));
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Snapshot;
    if (
      typeof value.schemaVersion === 'number' &&
      value.blueprint &&
      typeof value.blueprint === 'object'
    ) {
      return value;
    }
  } catch {
    // fall through
  }
  throw new CliError('validation', `${SNAPSHOT_PATH} is not a valid generation snapshot.`, {
    hint: 'Restore it from version control; it records what the generated code reflects.',
  });
}

const unsafeLink = (path: string) =>
  new CliError('unsafe_path', `Refusing to follow a symbolic link: ${path}`, {
    hint: 'Generated folders must be real directories inside the prototype. Remove the link and re-run.',
  });

const isSymlink = (path: string) =>
  lstat(path).then(
    (info) => info.isSymbolicLink(),
    () => false
  );

/**
 * Refuses a prototype whose `src`, `src/generated` or `src/generated/screens`
 * is a symbolic link: regeneration writes and (with --force) deletes there, and
 * a link could point anywhere on disk.
 */
export async function assertNoGeneratedLinks(dest: string): Promise<void> {
  for (const rel of ['src', 'src/generated', SCREENS_DIR]) {
    if (await isSymlink(join(dest, rel))) throw unsafeLink(rel);
  }
}

/** Status of every generated file against what `emitted` expects, plus stale generated screens. */
export async function planGeneratedFiles(
  dest: string,
  emitted: readonly EmittedFile[]
): Promise<FilePlan[]> {
  await assertNoGeneratedLinks(dest);
  const plans: FilePlan[] = [];
  for (const file of emitted.filter((f) => f.generated)) {
    if (await isSymlink(join(dest, file.path))) throw unsafeLink(file.path);
    const current = await readText(join(dest, file.path));
    if (current === null) plans.push({ path: file.path, status: 'created', content: file.content });
    else if (current === file.content) plans.push({ path: file.path, status: 'unchanged' });
    else if (checkHeader(current).intact) {
      plans.push({ path: file.path, status: 'changed', content: file.content });
    } else plans.push({ path: file.path, status: 'conflicted', content: file.content });
  }
  const expected = new Set(emitted.map((f) => f.path));
  const entries = await readdir(join(dest, SCREENS_DIR), { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const path = `${SCREENS_DIR}/${entry.name}`;
    if (entry.isSymbolicLink()) throw unsafeLink(path);
    // Only regular files are generated screens; anything else is left alone.
    if (!entry.isFile() || expected.has(path)) continue;
    const current = (await readText(join(dest, path))) ?? '';
    plans.push({ path, status: checkHeader(current).intact ? 'removed' : 'conflicted' });
  }
  return plans;
}

export interface RegenerationPlan {
  blueprint: Blueprint;
  blueprintText: string;
  snapshot: Snapshot;
  fromVersion: number;
  toVersion: number;
  /** Serializable upgrade steps of the appended version (empty when storage did not change). */
  ops: readonly unknown[];
  files: FilePlan[];
}

/**
 * Plans a regeneration of `dest` to `inputRaw` (the requested blueprint):
 * diffs it against the generation snapshot, appends a history entry when
 * storage changes, and classifies every generated file. Writes nothing.
 */
export async function planRegeneration(input: {
  dest: string;
  slug: string;
  inputRaw: Record<string, unknown>;
  manifestSchemaVersion: number;
  allowDrop: boolean;
}): Promise<RegenerationPlan> {
  const { dest, slug, inputRaw, allowDrop } = input;
  const onDiskText = await readText(join(dest, 'blueprint.json'));
  if (onDiskText === null) {
    throw new CliError(
      'conflict',
      `prototypes/${slug} has no blueprint.json, so it was not generated.`
    );
  }
  let onDiskRaw: Record<string, unknown>;
  try {
    onDiskRaw = JSON.parse(onDiskText) as Record<string, unknown>;
  } catch (error) {
    throw new CliError(
      'validation',
      `prototypes/${slug}/blueprint.json is not valid JSON: ${(error as Error).message}`
    );
  }
  parseOrThrow(onDiskRaw, `prototypes/${slug}/blueprint.json`);

  const snapshot = (await readSnapshot(dest)) ?? {
    schemaVersion: input.manifestSchemaVersion,
    blueprint: withoutHistory(onDiskRaw),
  };
  const previous = parseOrThrow(snapshot.blueprint, SNAPSHOT_PATH);
  const nextRaw = withoutHistory(inputRaw);
  const next = parseOrThrow(nextRaw, 'The blueprint');

  let migration: ReturnType<typeof diffBlueprints>;
  try {
    migration = diffBlueprints(previous, next, { fromVersion: snapshot.schemaVersion, allowDrop });
  } catch (error) {
    if (error instanceof MigrationError) {
      throw new CliError('validation', `Regeneration would lose data: ${error.message}`, {
        hint:
          error.code === 'drop-requires-allow'
            ? 'Re-run with --allow-drop to drop it (browser data in that table or field is deleted).'
            : undefined,
      });
    }
    throw error;
  }

  // The source-of-truth history is the one in the prototype, never the input's.
  const history = Array.isArray(onDiskRaw.history) ? [...(onDiskRaw.history as unknown[])] : [];
  if (migration) {
    history.push({
      schemaVersion: snapshot.schemaVersion,
      blueprint: snapshot.blueprint,
      ...(allowDrop ? { migrateNext: { allowDrop: true } } : {}),
    });
  }
  const finalRaw = history.length > 0 ? { ...nextRaw, history } : nextRaw;
  const blueprint = parseOrThrow(finalRaw, 'The blueprint with its history');
  const toVersion = migration?.version ?? snapshot.schemaVersion;
  if (latestSchemaVersion(blueprint) !== toVersion) {
    throw new CliError(
      'validation',
      `blueprint.json history rebuilds schema v${latestSchemaVersion(blueprint)}, but the generated code is at v${toVersion}.`,
      { hint: 'Restore blueprint.json (its "history") from version control.' }
    );
  }
  const blueprintText = formatJson(finalRaw);
  const emitted = emitOrThrow(blueprint, slug, blueprintText);
  const files = await planGeneratedFiles(dest, emitted);
  const nextSnapshot: Snapshot = { schemaVersion: toVersion, blueprint: nextRaw };
  nextSnapshot.codegenFormat = CODEGEN_FORMAT_VERSION;
  const managed: [string, string][] = [
    ['blueprint.json', blueprintText],
    [SNAPSHOT_PATH, snapshotText(nextSnapshot)],
  ];
  for (const [path, content] of managed) {
    const current = await readText(join(dest, path));
    // JSON is compared by value: reformatting it (for example by Biome) is not a change.
    files.push(
      current !== null && sameJsonText(current, content)
        ? { path, status: 'unchanged' }
        : { path, status: current === null ? 'created' : 'changed', content }
    );
  }
  for (const file of emitted.filter((f) => !f.generated && f.path !== 'blueprint.json')) {
    files.push({ path: file.path, status: 'skipped' });
  }
  return {
    blueprint,
    blueprintText,
    snapshot: nextSnapshot,
    fromVersion: snapshot.schemaVersion,
    toVersion,
    ops: migration?.ops ?? [],
    files,
  };
}

export interface DriftReport {
  ok: boolean;
  problems: string[];
  summary: string;
}

/**
 * The `blueprint` check of `protoyard validate`: blueprint.json parses, its
 * history rebuilds the manifest's schema version, the snapshot matches it, and
 * every generated file is present, unedited and up to date.
 */
export async function checkBlueprintDrift(
  dir: string,
  slug: string,
  manifestSchemaVersion: number
): Promise<DriftReport> {
  const problems: string[] = [];
  const text = await readText(join(dir, 'blueprint.json'));
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text ?? '') as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      problems: [`blueprint.json is not valid JSON: ${(error as Error).message}`],
      summary: '',
    };
  }
  const parsed = safeParseBlueprint(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues
        .slice(0, 10)
        .map((i) => `blueprint.json ${i.path.map(String).join('.') || '(root)'}: ${i.message}`),
      summary: '',
    };
  }
  const blueprint = parsed.data;
  let latest: number | null = null;
  try {
    latest = latestSchemaVersion(blueprint);
  } catch (error) {
    problems.push(`blueprint.json history does not rebuild: ${(error as Error).message}`);
  }
  if (latest !== null && latest !== manifestSchemaVersion) {
    problems.push(
      `history rebuilds schema v${latest}, but protoyard.json storage.schemaVersion is v${manifestSchemaVersion}`
    );
  }
  const snapshot = await readSnapshot(dir).catch((error: Error) => {
    problems.push(error.message);
    return null;
  });
  if (snapshot) {
    if ((snapshot.codegenFormat ?? 1) < CODEGEN_FORMAT_VERSION) {
      return {
        ok: false,
        problems: [
          `Generated code format ${snapshot.codegenFormat ?? 1} is outdated; run \`pnpm protoyard generate ${slug} --blueprint prototypes/${slug}/blueprint.json\` to regenerate and get screen routes.`,
        ],
        summary: '',
      };
    }
    if (snapshot.codegenFormat !== CODEGEN_FORMAT_VERSION) {
      problems.push(`${SNAPSHOT_PATH} uses unsupported codegen format ${snapshot.codegenFormat}`);
    }
    if (!sameJson(snapshot.blueprint, withoutHistory(raw))) {
      problems.push(
        `blueprint.json changed since the last generation: run \`pnpm protoyard generate ${slug} --blueprint prototypes/${slug}/blueprint.json\``
      );
    }
    if (snapshot.schemaVersion !== manifestSchemaVersion) {
      problems.push(
        `${SNAPSHOT_PATH} is at schema v${snapshot.schemaVersion}, protoyard.json at v${manifestSchemaVersion}`
      );
    }
  }
  const files = await planGeneratedFiles(dir, emitOrThrow(blueprint, slug, text ?? ''));
  for (const file of files) {
    if (file.status === 'created') problems.push(`missing ${file.path}`);
    else if (file.status === 'conflicted')
      problems.push(`${file.path} was edited by hand (hash mismatch)`);
    else if (file.status === 'changed') problems.push(`${file.path} is stale: regenerate`);
    else if (file.status === 'removed')
      problems.push(`${file.path} belongs to no blueprint entity: regenerate`);
  }
  const generated = files.filter((f) => f.status === 'unchanged').length;
  return {
    ok: problems.length === 0,
    problems,
    summary: `${blueprint.entities.length} entities, schema v${latest ?? '?'}, ${generated} generated files fresh`,
  };
}
