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
import { GENERATOR_SDK_VERSION } from '@protoyard/scenarios';
import type { Kernel } from './kernel.ts';
import { normalizeOverrides } from './overrides.ts';

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

export function snapshotFilename(slug: string, name: string, createdAt: string): string {
  return `${slug}-${slugify(name) || 'snapshot'}-${createdAt.slice(0, 10)}.protoyard.json`;
}

export interface SnapshotControllerExtras {
  /** Warnings from the last restore/import (unknown tables, older schema…). */
  lastWarnings(): readonly string[];
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
    const [tables, stats] = await Promise.all([dumpTables(k.db), countTables(k.db)]);
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
  async function apply(snapshot: Snapshot): Promise<string[]> {
    const notes: string[] = [];
    const result = await restoreTables(k.db, snapshot.tables, { knownTables: k.db.allTables });
    for (const name of result.skipped) notes.push(`Unknown table "${name}" was skipped.`);
    if (snapshot.schemaVersion < k.db.schemaVersion) {
      notes.push(
        `Snapshot rows use schema v${snapshot.schemaVersion}; they were restored as-is into v${k.db.schemaVersion}.`
      );
    }

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
          generatorVersion: GENERATOR_SDK_VERSION,
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

    await k.writeControl({
      activeScenario: active,
      overrides: Object.keys(overrides).length ? overrides : null,
      actorId: snapshot.actorId,
      organizationId: snapshot.organizationId,
      clock,
      timelineCheckpoint: clock
        ? {
            committedOffsetMs: clock.committedOffsetMs,
            at: new Date(Date.parse(clock.referenceTime) + clock.committedOffsetMs).toISOString(),
          }
        : null,
    });

    k.active = active;
    k.overrides = overrides;
    k.actorId = snapshot.actorId;
    k.organizationId = snapshot.organizationId;
    if (clock) k.setClockSilently(clock);
    await k.reloadIdentity();
    k.refreshDerived();
    k.events.overrides.emit(k.overrides);
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
        if (options.restore) {
          const notes = await apply(snapshot);
          warnings = [...new Set([...found, ...notes])];
        } else {
          warnings = found;
        }
        await k.control.putSnapshot(snapshot);
        return summarize(snapshot);
      }),
  };
}
