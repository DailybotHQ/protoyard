export type { Table, Transaction } from 'dexie';
export { liveQuery } from 'dexie';
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
  RESERVED_PREFIX,
  RESERVED_TABLE_NAMES,
} from './names.ts';
export {
  createPrototypeDatabase,
  type DatabaseSource,
  openPrototypeDatabase,
  PrototypeDatabase,
} from './prototype-database.ts';
export {
  deleteProtoyardDatabases,
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
