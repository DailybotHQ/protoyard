import type {
  ActiveScenarioInfo,
  ClockState,
  ColorMode,
  Overrides,
  Snapshot,
  SnapshotSummary,
} from '@protoyard/core';
import { Dexie, type Table } from 'dexie';
import { dexieBackendOptions, resolveFactory, type StorageBackend } from './backend.ts';
import { mapStorageError } from './errors.ts';
import { controlDatabaseName } from './names.ts';

/**
 * The control database holds everything ABOUT the world (active scenario,
 * overrides, clock, session, preferences, snapshots) and never domain rows.
 * Keeping it separate means appearance or session changes can never corrupt
 * prototype data, and a scenario load never wipes saved snapshots.
 */

export interface TimelineCheckpoint {
  /** Committed clock offset the timeline has been applied up to. */
  committedOffsetMs: number;
  /** ISO instant matching that offset (for humans and DevTools). */
  at: string;
}

export interface ControlState {
  activeScenario: ActiveScenarioInfo;
  overrides: Overrides;
  clock: ClockState;
  actorId: string;
  organizationId: string;
  /** Simulated sign-out (stored only while signed out). */
  signedOut: boolean;
  timelineCheckpoint: TimelineCheckpoint;
}

export type ControlStateKey = keyof ControlState;

export interface PersonaPreference {
  personaId: string;
  themeId?: string;
  mode?: ColorMode;
  reducedMotion?: boolean;
}

interface StateRow {
  key: string;
  value: unknown;
}

interface SnapshotPayloadRow {
  id: string;
  tables: Snapshot['tables'];
}

class ControlDatabase extends Dexie {
  state!: Table<StateRow, string>;
  preferences!: Table<PersonaPreference, string>;
  // Summaries and payloads are split so listing snapshots never loads rows.
  snapshots!: Table<SnapshotSummary, string>;
  snapshotTables!: Table<SnapshotPayloadRow, string>;

  constructor(namespace: string, backend: StorageBackend) {
    super(controlDatabaseName(namespace), dexieBackendOptions(backend));
    this.version(1).stores({
      state: 'key',
      preferences: 'personaId',
      snapshots: 'id, createdAt',
      snapshotTables: 'id',
    });
  }
}

export type ControlStatePatch = { [K in ControlStateKey]?: ControlState[K] | null };

export interface ControlStore {
  readonly namespace: string;
  readonly name: string;
  getState<K extends ControlStateKey>(key: K): Promise<ControlState[K] | undefined>;
  setState<K extends ControlStateKey>(key: K, value: ControlState[K]): Promise<void>;
  deleteState(...keys: ControlStateKey[]): Promise<void>;
  readState(): Promise<Partial<ControlState>>;
  /** Writes several keys in one transaction; `null` deletes a key. */
  writeState(patch: ControlStatePatch): Promise<void>;
  getPreference(personaId: string): Promise<PersonaPreference | undefined>;
  /** Merges into the stored preference; `undefined` fields are removed. */
  setPreference(
    personaId: string,
    patch: Omit<PersonaPreference, 'personaId'>
  ): Promise<PersonaPreference>;
  listPreferences(): Promise<PersonaPreference[]>;
  /** Newest first, without table payloads. */
  listSnapshots(): Promise<SnapshotSummary[]>;
  getSnapshot(id: string): Promise<Snapshot | undefined>;
  putSnapshot(snapshot: Snapshot): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
  /** Clears state, preferences and snapshots. */
  clearAll(): Promise<void>;
  close(): void;
}

function wrap<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    throw mapStorageError(error);
  });
}

export async function openControlStore(
  namespace: string,
  backend: StorageBackend = {}
): Promise<ControlStore> {
  resolveFactory(backend);
  const db = new ControlDatabase(namespace, backend);
  try {
    await db.open();
  } catch (error) {
    db.close();
    throw mapStorageError(error);
  }

  const store: ControlStore = {
    namespace,
    name: db.name,
    async getState(key) {
      const row = await wrap(db.state.get(key));
      return row?.value as never;
    },
    async setState(key, value) {
      await wrap(db.state.put({ key, value }));
    },
    async deleteState(...keys) {
      await wrap(db.state.bulkDelete(keys));
    },
    async readState() {
      const rows = await wrap(db.state.toArray());
      return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Partial<ControlState>;
    },
    async writeState(patch) {
      const puts: StateRow[] = [];
      const deletes: string[] = [];
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (value === null) deletes.push(key);
        else puts.push({ key, value });
      }
      await wrap(
        db.transaction('rw', db.state, async () => {
          if (deletes.length) await db.state.bulkDelete(deletes);
          if (puts.length) await db.state.bulkPut(puts);
        })
      );
    },
    getPreference: (personaId) => wrap(db.preferences.get(personaId)),
    async setPreference(personaId, patch) {
      return wrap(
        db.transaction('rw', db.preferences, async () => {
          const current = (await db.preferences.get(personaId)) ?? { personaId };
          const next: PersonaPreference = { ...current, ...patch, personaId };
          for (const key of Object.keys(next) as (keyof PersonaPreference)[]) {
            if (next[key] === undefined) delete next[key];
          }
          await db.preferences.put(next);
          return next;
        })
      );
    },
    listPreferences: () => wrap(db.preferences.toArray()),
    async listSnapshots() {
      return wrap(db.snapshots.orderBy('createdAt').reverse().toArray());
    },
    async getSnapshot(id) {
      const [summary, payload] = await wrap(
        db.transaction('r', db.snapshots, db.snapshotTables, () =>
          Promise.all([db.snapshots.get(id), db.snapshotTables.get(id)])
        )
      );
      if (!summary) return undefined;
      return { ...summary, tables: payload?.tables ?? [] };
    },
    async putSnapshot(snapshot) {
      const { tables, ...summary } = snapshot;
      await wrap(
        db.transaction('rw', db.snapshots, db.snapshotTables, async () => {
          await db.snapshots.put(summary);
          await db.snapshotTables.put({ id: snapshot.id, tables });
        })
      );
    },
    async deleteSnapshot(id) {
      await wrap(
        db.transaction('rw', db.snapshots, db.snapshotTables, async () => {
          await db.snapshots.delete(id);
          await db.snapshotTables.delete(id);
        })
      );
    },
    async clearAll() {
      await wrap(
        db.transaction('rw', db.tables, async () => {
          for (const table of db.tables) await table.clear();
        })
      );
    },
    close: () => db.close(),
  };
  return store;
}
