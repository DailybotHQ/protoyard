import type { StorageStatus } from '@protoyard/core';
import { loadMemoryBackend, resolveFactory, type StorageBackend } from './backend.ts';
import { type ControlStore, openControlStore } from './control-store.ts';
import { isStorageError, StorageError } from './errors.ts';
import {
  controlDatabaseName,
  dataDatabaseName,
  type ParsedDatabaseName,
  parseDatabaseName,
} from './names.ts';
import {
  type DatabaseSource,
  openPrototypeDatabase,
  type PrototypeDatabase,
} from './prototype-database.ts';

type StorageManagerLike = Pick<StorageManager, 'estimate' | 'persisted' | 'persist'>;

function storageManager(): StorageManagerLike | undefined {
  const nav = (globalThis as { navigator?: { storage?: StorageManagerLike } }).navigator;
  return nav?.storage && typeof nav.storage.estimate === 'function' ? nav.storage : undefined;
}

export const MEMORY_STORAGE_WARNING =
  'IndexedDB is unavailable (private browsing or blocked storage). This prototype is running from memory: changes are lost when you close or reload the tab.';

/**
 * Reports what storage this browser offers. Never throws: missing APIs simply
 * leave fields undefined.
 */
export async function probeStorage(backend: StorageBackend = {}): Promise<StorageStatus> {
  let available = true;
  try {
    resolveFactory(backend);
  } catch {
    available = false;
  }
  const status: StorageStatus = available
    ? { backend: 'indexeddb', persistent: true }
    : { backend: 'memory', persistent: false, warning: MEMORY_STORAGE_WARNING };
  const manager = storageManager();
  if (manager) {
    try {
      const estimate = await manager.estimate();
      if (estimate.usage !== undefined) status.usageBytes = estimate.usage;
      if (estimate.quota !== undefined) status.quotaBytes = estimate.quota;
    } catch {
      // Some browsers reject estimate() in private contexts; it is optional.
    }
    try {
      if (typeof manager.persisted === 'function') status.persisted = await manager.persisted();
    } catch {
      // Optional API.
    }
  }
  return status;
}

/**
 * Asks the browser to keep this origin's data under storage pressure. Returns
 * `false` when refused or unsupported — persistence is never assumed.
 */
export async function requestPersistence(): Promise<boolean> {
  const manager = storageManager();
  if (!manager || typeof manager.persist !== 'function') return false;
  try {
    return await manager.persist();
  } catch {
    return false;
  }
}

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Another tab still has it open; the delete completes once it closes.
    request.onblocked = () => reject(new StorageError('blocked'));
  });
}

/** Deletes ONLY this prototype's data + control databases. */
export async function deleteProtoyardDatabases(
  namespace: string,
  backend: StorageBackend = {}
): Promise<void> {
  const factory = resolveFactory(backend);
  await deleteDatabase(factory, dataDatabaseName(namespace));
  await deleteDatabase(factory, controlDatabaseName(namespace));
}

export interface DatabaseListing {
  /** False when the browser can't enumerate databases (no `indexedDB.databases()`). */
  supported: boolean;
  /** This prototype's databases: the default world and every sandbox. */
  databases: ParsedDatabaseName[];
  /** Sandbox names with at least one database, sorted. */
  sandboxes: string[];
}

/**
 * Lists a prototype's databases, including sandboxes, so DevTools can offer
 * "Clear N sandboxes". Never throws: an unsupported or failing enumeration
 * reports `supported: false` with empty lists.
 */
export async function listProtoyardDatabases(
  namespace: string,
  backend: StorageBackend = {}
): Promise<DatabaseListing> {
  let factory: IDBFactory;
  try {
    factory = resolveFactory(backend);
  } catch {
    return { supported: false, databases: [], sandboxes: [] };
  }
  if (typeof factory.databases !== 'function') {
    return { supported: false, databases: [], sandboxes: [] };
  }
  try {
    const infos = await factory.databases();
    const databases = infos
      .map((info) => (info.name ? parseDatabaseName(info.name) : null))
      .filter((db): db is ParsedDatabaseName => db !== null && db.namespace === namespace)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sandboxes = [
      ...new Set(databases.flatMap((db) => (db.sandbox ? [db.sandbox] : []))),
    ].sort();
    return { supported: true, databases, sandboxes };
  } catch {
    return { supported: false, databases: [], sandboxes: [] };
  }
}

export interface PrototypeStorage {
  db: PrototypeDatabase;
  control: ControlStore;
  status: StorageStatus;
  /** The backend actually used (memory backend in degraded mode). */
  backend: StorageBackend;
}

/**
 * Opens both databases. When IndexedDB cannot be used at all, falls back to an
 * in-memory backend and says so in `status` — persistence is never faked.
 * Other failures (quota, newer version, blocked) are thrown: silently switching
 * to memory there would hide the user's real data.
 */
export async function openPrototypeStorage(
  source: DatabaseSource,
  options: StorageBackend & { allowMemoryFallback?: boolean } = {}
): Promise<PrototypeStorage> {
  const backend: StorageBackend = {};
  if (options.indexedDB) backend.indexedDB = options.indexedDB;
  if (options.IDBKeyRange) backend.IDBKeyRange = options.IDBKeyRange;
  const namespace = source.manifest.storage.namespace;
  try {
    const db = await openPrototypeDatabase(source, backend);
    try {
      const control = await openControlStore(namespace, backend);
      return { db, control, status: await probeStorage(backend), backend };
    } catch (error) {
      db.close();
      throw error;
    }
  } catch (error) {
    const unavailable = isStorageError(error) && error.code === 'unavailable';
    if (!unavailable || options.allowMemoryFallback === false) throw error;
    const memory = await loadMemoryBackend();
    const db = await openPrototypeDatabase(source, memory);
    const control = await openControlStore(namespace, memory);
    return {
      db,
      control,
      status: { backend: 'memory', persistent: false, warning: MEMORY_STORAGE_WARNING },
      backend: memory,
    };
  }
}
