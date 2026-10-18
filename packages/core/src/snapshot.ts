import { z } from 'zod';
import { EnvironmentPatchSchema } from './environment.ts';
import { ColorModeSchema } from './manifest.ts';
import { ClockStateSchema } from './overrides.ts';

/**
 * Snapshot = the ACTUAL current world after manual interactions (records,
 * actor, clock, environment, appearance). It is not a seed: restoring it
 * reproduces edits that no generator could.
 *
 * Snapshot files are data. They are validated with this schema and never
 * evaluated as code; rendered strings go through Svelte's escaped text.
 */

export const SNAPSHOT_FORMAT = 'protoyard.snapshot';
export const SNAPSHOT_FORMAT_VERSION = 1;
/** Hard ceiling for imported snapshot files (bytes). */
export const SNAPSHOT_MAX_BYTES = 25 * 1024 * 1024;

export const SnapshotTableSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  rows: z.array(z.record(z.string(), z.unknown())),
});

export const SnapshotSchema = z
  .object({
    format: z.literal(SNAPSHOT_FORMAT),
    formatVersion: z.literal(SNAPSHOT_FORMAT_VERSION),
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    notes: z.string().max(2000).default(''),
    prototypeId: z.string().min(1),
    prototypeVersion: z.string(),
    schemaVersion: z.number().int().positive(),
    scenarioId: z.string().nullable(),
    scenarioVersion: z.number().int().nullable(),
    seed: z.number().int().nullable(),
    referenceTime: z.string().nullable(),
    createdAt: z.string(),
    actorId: z.string().nullable(),
    organizationId: z.string().nullable(),
    /** Simulated sign-out at capture time. Absent (older files, signed in) means signed in. */
    signedOut: z.boolean().optional(),
    clock: ClockStateSchema.nullable(),
    environment: EnvironmentPatchSchema,
    overrides: z.record(z.string(), z.unknown()).default({}),
    appearance: z
      .object({
        themeId: z.string().optional(),
        mode: ColorModeSchema.optional(),
      })
      .default({}),
    tables: z.array(SnapshotTableSchema),
    stats: z.record(z.string(), z.number().int().nonnegative()).default({}),
  })
  .strict();

export type Snapshot = z.infer<typeof SnapshotSchema>;

/** Lightweight listing entry (no table payload). */
export type SnapshotSummary = Omit<Snapshot, 'tables'>;

export type SnapshotValidation =
  | { ok: true; snapshot: Snapshot; warnings: string[] }
  | { ok: false; error: string };

/**
 * Validates untrusted snapshot input (already JSON-parsed) for a target
 * prototype. Never throws; returns a user-presentable error instead.
 */
export function validateSnapshot(
  input: unknown,
  target: { prototypeId: string; schemaVersion: number; tables: readonly string[] }
): SnapshotValidation {
  const parsed = SnapshotSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Not a valid Protoyard snapshot: ${issue ? `${issue.path.join('.') || 'root'} — ${issue.message}` : 'unknown error'}.`,
    };
  }
  const snapshot = parsed.data;
  if (snapshot.prototypeId !== target.prototypeId) {
    return {
      ok: false,
      error: `This snapshot belongs to "${snapshot.prototypeId}", not "${target.prototypeId}". Nothing was changed.`,
    };
  }
  if (snapshot.schemaVersion > target.schemaVersion) {
    return {
      ok: false,
      error: `Snapshot schema v${snapshot.schemaVersion} is newer than this prototype (v${target.schemaVersion}). Update the prototype first.`,
    };
  }
  const warnings: string[] = [];
  const known = new Set(target.tables);
  for (const table of snapshot.tables) {
    if (!known.has(table.name)) warnings.push(`Unknown table "${table.name}" will be skipped.`);
  }
  if (snapshot.schemaVersion < target.schemaVersion) {
    warnings.push(
      `Snapshot schema v${snapshot.schemaVersion} is older than v${target.schemaVersion}: rows are restored as-is (database migrations do not replay on snapshot data). Check fields added since v${snapshot.schemaVersion}.`
    );
  }
  return { ok: true, snapshot, warnings };
}

/**
 * UTF-8 size check. `text.length` counts UTF-16 code units, so a file full of
 * emoji can be ~2x larger in bytes than its length suggests. A cheap length
 * check runs first; bytes are only measured when the string could exceed.
 */
export function utf8ByteLengthExceeds(text: string, maxBytes: number): boolean {
  if (text.length > maxBytes) return true;
  if (text.length * 3 <= maxBytes) return false;
  return new TextEncoder().encode(text).byteLength > maxBytes;
}

export function parseSnapshotText(
  text: string,
  target: { prototypeId: string; schemaVersion: number; tables: readonly string[] }
): SnapshotValidation {
  if (utf8ByteLengthExceeds(text, SNAPSHOT_MAX_BYTES)) {
    return { ok: false, error: 'Snapshot file is larger than 25 MB and was not imported.' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Snapshot file is not valid JSON. Nothing was changed.' };
  }
  return validateSnapshot(json, target);
}
