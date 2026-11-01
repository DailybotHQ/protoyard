import type { DatabaseVersion } from '@protoyard/core';
import type { Transaction } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  clearWorld,
  countTables,
  type DatabaseSource,
  deleteProtoyardDatabases,
  dumpTables,
  openPrototypeDatabase,
  openPrototypeStorage,
  probeStorage,
  restoreTables,
  StorageError,
} from '../src/index.ts';

const backend = () => ({
  indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
  IDBKeyRange: IDBKeyRange as unknown as typeof globalThis.IDBKeyRange,
});

function source(versions: DatabaseVersion[], namespace = 'notes'): DatabaseSource {
  return {
    manifest: { storage: { namespace, schemaVersion: versions.at(-1)?.version ?? 1 } },
    database: { versions },
  };
}

const v1: DatabaseVersion = { version: 1, stores: { notes: 'id, folderId', folders: 'id' } };
const v2: DatabaseVersion = {
  version: 2,
  stores: { notes: 'id, folderId, pinned', folders: null },
  upgrade: async (tx) => {
    await (tx as Transaction)
      .table('notes')
      .toCollection()
      .modify((note: Record<string, unknown>) => {
        note.pinned = note.title === 'Important';
      });
  },
};

describe('schema', () => {
  it('refuses tables with the reserved py_ prefix', async () => {
    await expect(
      openPrototypeDatabase(source([{ version: 1, stores: { py_custom: 'id' } }]), backend())
    ).rejects.toThrow(/reserved/);
  });
});

describe('migrations', () => {
  it('upgrades v1 → v2, keeping and transforming rows, and refuses newer data', async () => {
    const store = backend();
    const db1 = await openPrototypeDatabase(source([v1]), store);
    await db1.table('notes').bulkAdd([
      { id: 'n1', title: 'Important', folderId: 'f1' },
      { id: 'n2', title: 'Other', folderId: 'f1' },
    ]);
    await db1.table('py_personas').add({ id: 'user_0001', name: 'Ada' });
    db1.close();

    const db2 = await openPrototypeDatabase(source([v1, v2]), store);
    expect(await db2.table('notes').where('pinned').equals(1).count()).toBe(0);
    const notes = await db2.table('notes').toArray();
    expect(notes).toEqual([
      { id: 'n1', title: 'Important', folderId: 'f1', pinned: true },
      { id: 'n2', title: 'Other', folderId: 'f1', pinned: false },
    ]);
    expect(await db2.table('py_personas').count()).toBe(1);
    expect(db2.hasTable('folders')).toBe(false);
    db2.close();

    const error = await openPrototypeDatabase(source([v1]), store).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).code).toBe('version-newer');
    // Nothing was deleted.
    const again = await openPrototypeDatabase(source([v1, v2]), store);
    expect(await again.table('notes').count()).toBe(2);
    again.close();
  });
});

describe('world I/O', () => {
  it('dumps, restores atomically and clears', async () => {
    const db = await openPrototypeDatabase(source([v1]), backend());
    await db.table('notes').bulkAdd([{ id: 'n1' }, { id: 'n2' }]);
    await db.table('py_personas').add({ id: 'p1', name: 'Ada' });
    const dump = await dumpTables(db);
    expect(dump.find((t) => t.name === 'notes')?.rows).toHaveLength(2);

    await db.table('notes').clear();
    await db.table('folders').add({ id: 'f-new' });
    const result = await restoreTables(db, [...dump, { name: 'ghost', rows: [{ id: 'x' }] }]);
    expect(result.skipped).toEqual(['ghost']);
    expect(await dumpTables(db)).toEqual(dump);

    // A bad row (no key) aborts everything: current data stays.
    const bad = dump.map((t) =>
      t.name === 'notes' ? { ...t, rows: [{ id: 'n9' }, { title: 'no id' }] } : t
    );
    await expect(restoreTables(db, bad)).rejects.toBeInstanceOf(StorageError);
    expect(await dumpTables(db)).toEqual(dump);

    await clearWorld(db);
    expect(Object.values(await countTables(db)).every((n) => n === 0)).toBe(true);
    db.close();
  });
});

describe('storage status and errors', () => {
  it('reports IndexedDB normally and falls back to memory honestly', async () => {
    expect((await probeStorage(backend())).backend).toBe('indexeddb');
    const original = globalThis.indexedDB;
    try {
      // @ts-expect-error simulate a browser without IndexedDB
      delete globalThis.indexedDB;
      expect(await probeStorage()).toMatchObject({ backend: 'memory', persistent: false });
      const storage = await openPrototypeStorage(source([v1], 'memory-demo'));
      expect(storage.status).toMatchObject({ backend: 'memory', persistent: false });
      expect(storage.status.warning).toMatch(/lost/);
      await storage.db.table('notes').add({ id: 'n1' });
      expect(await storage.db.table('notes').count()).toBe(1);
      storage.db.close();
      storage.control.close();
      await expect(
        openPrototypeStorage(source([v1], 'memory-demo'), { allowMemoryFallback: false })
      ).rejects.toMatchObject({ code: 'unavailable' });
    } finally {
      globalThis.indexedDB = original;
    }
  });

  it('deletes only the given namespace', async () => {
    const store = backend();
    const a = await openPrototypeStorage(source([v1], 'alpha'), store);
    const b = await openPrototypeStorage(source([v1], 'beta'), store);
    a.db.close();
    a.control.close();
    await deleteProtoyardDatabases('alpha', store);
    const names = (await store.indexedDB.databases()).map((d) => d.name).sort();
    expect(names).toEqual(['protoyard.beta.control', 'protoyard.beta.data']);
    b.db.close();
    b.control.close();
  });
});
