import type { Row, Snapshot } from '@protoyard/core';
import { mapStorageError } from './errors.ts';
import type { PrototypeDatabase } from './prototype-database.ts';

export type SnapshotTable = Snapshot['tables'][number];

/** Reads every domain + reserved table in one read transaction (consistent view). */
export async function dumpTables(db: PrototypeDatabase): Promise<SnapshotTable[]> {
  const names = db.allTables;
  try {
    return await db.transaction('r', [...names], async () => {
      const out: SnapshotTable[] = [];
      for (const name of names) {
        out.push({ name, rows: (await db.table(name).toArray()) as Row[] });
      }
      return out;
    });
  } catch (error) {
    throw mapStorageError(error);
  }
}

export interface RestoreResult {
  restored: string[];
  /** Tables present in the input but unknown to this schema. */
  skipped: string[];
}

/**
 * Replaces the whole world in ONE read-write transaction: every known table is
 * cleared and refilled. If anything fails (bad row, quota) IndexedDB aborts the
 * transaction and the current data stays exactly as it was.
 */
export async function restoreTables(
  db: PrototypeDatabase,
  tables: readonly SnapshotTable[],
  options: { knownTables?: readonly string[] } = {}
): Promise<RestoreResult> {
  const known = new Set(options.knownTables ?? db.allTables);
  const restored: string[] = [];
  const skipped: string[] = [];
  const byName = new Map<string, SnapshotTable['rows']>();
  for (const table of tables) {
    if (known.has(table.name) && db.hasTable(table.name)) {
      byName.set(table.name, [...(byName.get(table.name) ?? []), ...table.rows]);
    } else skipped.push(table.name);
  }
  const targets = db.allTables.filter((name) => known.has(name));
  try {
    await db.transaction('rw', targets, async () => {
      for (const name of targets) {
        const table = db.table(name);
        await table.clear();
        const rows = byName.get(name);
        if (rows?.length) {
          await table.bulkAdd(rows);
          restored.push(name);
        }
      }
    });
  } catch (error) {
    throw mapStorageError(error);
  }
  return { restored, skipped };
}

/** Clears domain + reserved tables in one transaction (used before seeding). */
export async function clearWorld(db: PrototypeDatabase): Promise<void> {
  try {
    await db.transaction('rw', [...db.allTables], async () => {
      for (const name of db.allTables) await db.table(name).clear();
    });
  } catch (error) {
    throw mapStorageError(error);
  }
}

export async function countTables(db: PrototypeDatabase): Promise<Record<string, number>> {
  const names = db.allTables;
  try {
    return await db.transaction('r', [...names], async () => {
      const counts: Record<string, number> = {};
      for (const name of names) counts[name] = await db.table(name).count();
      return counts;
    });
  } catch (error) {
    throw mapStorageError(error);
  }
}
