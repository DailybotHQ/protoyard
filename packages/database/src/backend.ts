import { StorageError } from './errors.ts';

/**
 * Which IndexedDB implementation to use. Omitted fields mean "the browser's".
 * Tests and the degraded in-memory mode inject `fake-indexeddb` here.
 */
export interface StorageBackend {
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
}

export function resolveFactory(backend: StorageBackend = {}): IDBFactory {
  const factory = backend.indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) {
    throw new StorageError('unavailable', {
      message:
        'IndexedDB is not available in this environment. Changes will not persist after you close the tab.',
    });
  }
  return factory;
}

/** Dexie constructor options for an explicit backend (empty = browser default). */
export function dexieBackendOptions(backend: StorageBackend = {}): StorageBackend {
  const options: StorageBackend = {};
  if (backend.indexedDB) options.indexedDB = backend.indexedDB;
  if (backend.IDBKeyRange) options.IDBKeyRange = backend.IDBKeyRange;
  return options;
}

/**
 * In-memory IndexedDB for when the real one cannot open (private mode,
 * disabled storage). Loaded lazily so `fake-indexeddb` never ships in the
 * normal path; data lives only as long as the page.
 */
export async function loadMemoryBackend(): Promise<Required<StorageBackend>> {
  const mod = await import('fake-indexeddb');
  return {
    indexedDB: new mod.IDBFactory() as unknown as IDBFactory,
    IDBKeyRange: mod.IDBKeyRange as unknown as typeof IDBKeyRange,
  };
}
