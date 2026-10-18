import {
  type ActiveScenarioInfo,
  type ClockState,
  createRuntimeId,
  type Overrides,
  parseSnapshotText,
  SNAPSHOT_FORMAT,
  SNAPSHOT_FORMAT_VERSION,
  type Snapshot,
  type SnapshotController,
  type SnapshotSummary,
  slugify,
} from '@protoyard/core';
import { countTables, dumpTables, restoreTables } from '@protoyard/database';
import type { Kernel } from './kernel.ts';
import { applyOverrides, normalizeOverrides } from './overrides.ts';
import { generatorVersions } from './scenarios.ts';

export class SnapshotImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotImportError';
  }
}

function summarize(snapshot: Snapshot): SnapshotSummary {
  const { tables: _tables, ...summary } = snapshot;
  return summary;
}

/** Largest restorable world; far above any demo, far below what freezes a tab. */
export const SNAPSHOT_MAX_ROWS = 250_000;
/** ECMAScript Date range (±100,000,000 days around 1970). */
const MAX_DATE_MS = 8.64e15;

function invalid(message: string): SnapshotImportError {
  return new SnapshotImportError(`${message} Nothing was changed.`);
}

/** Rows need a usable primary key, and the world must stay a sane size. */
function assertRestorableRows(snapshot: Snapshot): void {
  let total = 0;
  for (const table of snapshot.tables) {
    total += table.rows.length;
    if (total > SNAPSHOT_MAX_ROWS) {
      throw invalid(`Snapshot has more than ${SNAPSHOT_MAX_ROWS.toLocaleString('en-US')} rows.`);
    }
    table.rows.forEach((row, index) => {
      const id = row.id;
      const ok =
        (typeof id === 'string' && id.length > 0 && id.length <= 512) ||
        (typeof id === 'number' && Number.isFinite(id));
      if (!ok) throw invalid(`Row ${index + 1} of table "${table.name}" has no valid id.`);
    });
  }
}

/** Validates a clock from untrusted input and derives its checkpoint. */
function clockCheckpoint(clock: ClockState): { committedOffsetMs: number; at: string } {
  const reference = Date.parse(clock.referenceTime);
  const committed = reference + clock.committedOffsetMs;
  const effective = committed + clock.previewOffsetMs;
  if (
    !Number.isFinite(reference) ||
    !Number.isFinite(committed) ||
    !Number.isFinite(effective) ||
    Math.abs(committed) > MAX_DATE_MS ||
    Math.abs(effective) > MAX_DATE_MS ||
    (clock.runningSince !== undefined && !Number.isFinite(clock.runningSince))
  ) {
    throw invalid('Snapshot clock is not a valid point in time.');
  }
  return { committedOffsetMs: clock.committedOffsetMs, at: new Date(committed).toISOString() };
}

export function snapshotFilename(slug: string, name: string, createdAt: string): string {
  return `${slug}-${slugify(name) || 'snapshot'}-${createdAt.slice(0, 10)}.protoyard.json`;
}

export interface SnapshotControllerExtras {
  /** Warnings from the last restore/import (unknown tables, older schema…). */
  lastWarnings(): readonly string[];
}

/** True for binary payloads (uploaded files) that a JSON snapshot cannot carry. */
function isBinary(value: unknown): boolean {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  );
}

/**
 * Snapshots are JSON: uploaded file bytes (ArrayBuffer/Blob fields) are left
 * out and set to `null`, so the row keeps its metadata and readers can tell the
 * contents are missing instead of receiving a placeholder object.
 */
export function stripBinaryFields<T extends { name: string; rows: unknown[] }>(
  tables: T[]
): { tables: T[]; excluded: number } {
  let excluded = 0;
  const out = tables.map((table) => ({
    ...table,
    rows: table.rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      let copy: Record<string, unknown> | null = null;
      for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        if (!isBinary(value)) continue;
        copy ??= { ...(row as Record<string, unknown>) };
        copy[key] = null;
        excluded += 1;
      }
      return copy ?? row;
    }),
  }));
  return { tables: out, excluded };
}

export function createSnapshotController(k: Kernel): SnapshotController & SnapshotControllerExtras {
  const manifest = k.definition.manifest;
  const target = () => ({
    prototypeId: manifest.id,
    schemaVersion: k.db.schemaVersion,
    tables: k.db.allTables,
  });
  let warnings: string[] = [];

  async function build(input: { name: string; notes?: string } = { name: 'Current world' }) {
    const [dumped, stats] = await Promise.all([dumpTables(k.db), countTables(k.db)]);
    const { tables } = stripBinaryFields(dumped);
    const active = k.active;
    const appearance = k.appearance;
    const snapshot: Snapshot = {
      format: SNAPSHOT_FORMAT,
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      id: createRuntimeId('snap'),
      name: input.name.trim().slice(0, 120) || 'Snapshot',
      notes: (input.notes ?? '').slice(0, 2000),
      prototypeId: manifest.id,
      prototypeVersion: manifest.version,
      schemaVersion: k.db.schemaVersion,
      scenarioId: active?.scenario.id ?? null,
      scenarioVersion: active?.scenario.version ?? null,
      seed: active?.seed ?? null,
      referenceTime: active?.scenario.referenceTime ?? null,
      createdAt: new Date(k.now()).toISOString(),
      actorId: k.principal?.persona.id ?? k.actorId,
      organizationId: k.principal?.organization?.id ?? k.organizationId,
      // Written only while signed out, so signed-in snapshots keep their old shape.
      ...(k.signedOut ? { signedOut: true } : {}),
      clock: k.clock.getState(),
      environment: k.env.get(),
      overrides: { ...k.overrides },
      appearance: { themeId: appearance.theme.value, mode: appearance.mode.value },
      tables,
      stats,
    };
    return snapshot;
  }

  /**
   * Records first (one atomic transaction — a failure leaves everything as
   * it was), then the control state that describes them.
   */
  /** `progress.tablesRestored` turns true once the records were replaced (atomically). */
  async function apply(
    snapshot: Snapshot,
    progress: { tablesRestored: boolean } = { tablesRestored: false }
  ): Promise<string[]> {
    // Prepare and validate EVERYTHING first: once the record transaction commits,
    // nothing below may fail on bad input, or a "rejected" import would have
    // already replaced the user's data.
    const notes: string[] = [];
    assertRestorableRows(snapshot);

    const scenario = snapshot.scenarioId
      ? k.scenarios.find((s) => s.id === snapshot.scenarioId)
      : undefined;
    if (snapshot.scenarioId && !scenario) {
      notes.push(
        `Scenario "${snapshot.scenarioId}" no longer exists; records were restored without it.`
      );
    }
    const active: ActiveScenarioInfo | null = scenario
      ? {
          scenario,
          seed: snapshot.seed ?? scenario.seed,
          ...generatorVersions(k),
          loadedAt: snapshot.createdAt,
        }
      : null;

    let overrides: Overrides = {};
    try {
      overrides = normalizeOverrides(snapshot.overrides);
    } catch {
      notes.push('Snapshot overrides were invalid and were ignored.');
    }

    const referenceTime = snapshot.referenceTime ?? active?.scenario.referenceTime;
    const clock: ClockState | null = snapshot.clock
      ? {
          ...snapshot.clock,
          // A running clock resumes from now instead of jumping by the time it sat in a file.
          ...(snapshot.clock.running ? { runningSince: k.now() } : {}),
        }
      : referenceTime
        ? { referenceTime, committedOffsetMs: 0, previewOffsetMs: 0, running: false }
        : null;
    const checkpoint = clock ? clockCheckpoint(clock) : null;

    const result = await restoreTables(k.db, snapshot.tables, { knownTables: k.db.allTables });
    progress.tablesRestored = true;
    for (const name of result.skipped) notes.push(`Unknown table "${name}" was skipped.`);
    if (snapshot.schemaVersion < k.db.schemaVersion) {
      notes.push(
        `Snapshot rows use schema v${snapshot.schemaVersion}; they were restored as-is into v${k.db.schemaVersion}.`
      );
    }

    await k.writeControl({
      activeScenario: active,
      overrides: Object.keys(overrides).length ? overrides : null,
      actorId: snapshot.actorId,
      organizationId: snapshot.organizationId,
      signedOut: snapshot.signedOut ? true : null,
      clock,
      timelineCheckpoint: checkpoint,
    });

    k.active = active;
    k.overrides = overrides;
    k.actorId = snapshot.actorId;
    k.organizationId = snapshot.organizationId;
    k.signedOut = snapshot.signedOut === true;
    if (clock) k.setClockSilently(clock);
    await k.reloadIdentity();
    k.refreshDerived();
    // Per-persona preferences are not part of a snapshot, so the same records could
    // render in another theme here. Pin the captured look as visible, clearable
    // overrides — only when it would otherwise differ.
    const captured = snapshot.appearance;
    const pin: Record<string, unknown> = {};
    if (captured.themeId && captured.themeId !== k.appearance.theme.value) {
      if (k.themes.some((t) => t.id === captured.themeId)) pin.themeId = captured.themeId;
      else notes.push(`Theme "${captured.themeId}" is not available here; kept the current theme.`);
    }
    if (captured.mode && captured.mode !== k.appearance.mode.value) pin.mode = captured.mode;
    if (Object.keys(pin).length) {
      await applyOverrides(k, { ...k.overrides, ...pin });
    } else {
      k.events.overrides.emit(k.overrides);
    }
    k.events.scenario.emit(active);
    warnings = notes;
    return notes;
  }

  async function save(input: { name: string; notes?: string }): Promise<SnapshotSummary> {
    const snapshot = await build(input);
    await k.control.putSnapshot(snapshot);
    return summarize(snapshot);
  }

  function parse(text: string) {
    const result = parseSnapshotText(text, target());
    if (!result.ok) throw new SnapshotImportError(result.error);
    // Same checks as restore, so a preview already tells the truth.
    assertRestorableRows(result.snapshot);
    if (result.snapshot.clock) clockCheckpoint(result.snapshot.clock);
    return result;
  }

  return {
    list: () => k.control.listSnapshots(),
    save,
    build: () => build(),
    lastWarnings: () => warnings,

    restore: (id) =>
      k.serial(async () => {
        const snapshot = await k.control.getSnapshot(id);
        if (!snapshot) throw new Error(`Snapshot "${id}" was not found.`);
        await apply(snapshot);
      }),

    remove: (id) => k.control.deleteSnapshot(id),

    async exportJson(id) {
      const snapshot = id ? await k.control.getSnapshot(id) : await build();
      if (!snapshot) throw new Error(`Snapshot "${id}" was not found.`);
      return {
        filename: snapshotFilename(manifest.slug, snapshot.name, snapshot.createdAt),
        json: `${JSON.stringify(snapshot, null, 2)}\n`,
      };
    },

    async previewImport(text) {
      const { snapshot, warnings: found } = parse(text);
      const rowCounts: Record<string, number> = {};
      for (const table of snapshot.tables) {
        rowCounts[table.name] = (rowCounts[table.name] ?? 0) + table.rows.length;
      }
      return { snapshot: summarize(snapshot), warnings: found, rowCounts };
    },

    importJson: (text, options = {}) =>
      k.serial(async () => {
        const { snapshot: parsed, warnings: found } = parse(text);
        // A fresh id: importing the same file twice never overwrites a stored snapshot.
        const snapshot: Snapshot = { ...parsed, id: createRuntimeId('snap') };
        // Store the copy FIRST: if that fails (quota), nothing has changed yet. If
        // the restore fails before the records change (restoreTables is atomic),
        // drop the copy again so a rejected import leaves no trace. If it fails
        // AFTER the records were replaced (control state, identity), keep the copy:
        // the world already holds its rows and the stored copy is the way to retry.
        await k.control.putSnapshot(snapshot);
        if (options.restore) {
          const progress = { tablesRestored: false };
          try {
            const notes = await apply(snapshot, progress);
            warnings = [...new Set([...found, ...notes])];
          } catch (error) {
            if (!progress.tablesRestored) {
              await k.control.deleteSnapshot(snapshot.id).catch(k.report);
            }
            throw error;
          }
        } else {
          warnings = found;
        }
        return summarize(snapshot);
      }),
  };
}
