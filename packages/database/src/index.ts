export type { Table, Transaction } from 'dexie';
export { Dexie, liveQuery } from 'dexie';
export { loadMemoryBackend, type StorageBackend } from './backend.ts';
export {
  type ControlState,
  type ControlStateKey,
  type ControlStatePatch,
  type ControlStore,
  openControlStore,
  type PersonaPreference,
  type TimelineCheckpoint,
} from './control-store.ts';
export {
  isStorageError,
  mapStorageError,
  STORAGE_ERROR_MESSAGES,
  StorageError,
  type StorageErrorCode,
} from './errors.ts';
export {
  allTableNames,
  controlDatabaseName,
  DATABASE_PREFIX,
  dataDatabaseName,
  domainTableNames,
  latestVersion,
  type ParsedDatabaseName,
  parseDatabaseName,
  RESERVED_PREFIX,
  RESERVED_TABLE_NAMES,
  reviewDatabaseName,
  SANDBOX_SEPARATOR,
  sandboxNamespace,
} from './names.ts';
export {
  createPrototypeDatabase,
  type DatabaseSource,
  openPrototypeDatabase,
  PrototypeDatabase,
} from './prototype-database.ts';
export {
  type DatabaseListing,
  deleteProtoyardDatabases,
  listProtoyardDatabases,
  MEMORY_STORAGE_WARNING,
  openPrototypeStorage,
  type PrototypeStorage,
  probeStorage,
  requestPersistence,
} from './storage.ts';
export {
  clearWorld,
  countTables,
  dumpTables,
  type RestoreResult,
  restoreTables,
  type SnapshotTable,
} from './world-io.ts';
