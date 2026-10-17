import {
  type DatabaseDefinition,
  type PrototypeManifest,
  RESERVED_TABLES,
  type Row,
} from '@protoyard/core';
import { Dexie, type Table } from 'dexie';
import { dexieBackendOptions, resolveFactory, type StorageBackend } from './backend.ts';
import { mapStorageError, StorageError } from './errors.ts';
import {
  dataDatabaseName,
  domainTableNames,
  latestVersion,
  RESERVED_PREFIX,
  RESERVED_TABLE_NAMES,
} from './names.ts';

/** The parts of a prototype definition the database layer needs. */
export interface DatabaseSource {
  manifest: Pick<PrototypeManifest, 'storage'>;
  database: DatabaseDefinition;
}

/**
 * A prototype's data database: its own versioned domain tables plus the
 * reserved `py_*` platform tables, merged into every version so identities and
 * events survive any domain migration.
 */
export class PrototypeDatabase extends Dexie {
  readonly namespace: string;
  /** Latest schema version declared by the code. */
  readonly schemaVersion: number;
  readonly domainTables: readonly string[];
  readonly reservedTables: readonly string[] = RESERVED_TABLE_NAMES;

  constructor(source: DatabaseSource, backend: StorageBackend = {}) {
    const namespace = source.manifest.storage.namespace;
    super(dataDatabaseName(namespace), dexieBackendOptions(backend));
    this.namespace = namespace;
    this.schemaVersion = latestVersion(source.database);
    this.domainTables = domainTableNames(source.database);

    for (const version of source.database.versions) {
      for (const name of Object.keys(version.stores)) {
        if (name.startsWith(RESERVED_PREFIX)) {
          throw new Error(
            `Table "${name}" uses the reserved "${RESERVED_PREFIX}" prefix. Rename it in database/schema.ts.`
          );
        }
      }
      const declared = this.version(version.version).stores({
        ...version.stores,
        ...RESERVED_TABLES,
      });
      const upgrade = version.upgrade;
      if (upgrade) declared.upgrade((tx) => upgrade(tx));
    }
  }

  /** Domain tables first, then reserved tables. */
  get allTables(): readonly string[] {
    return [...this.domainTables, ...this.reservedTables];
  }

  hasTable(name: string): boolean {
    return this.domainTables.includes(name) || this.reservedTables.includes(name);
  }

  /** Typed table accessor that refuses unknown names with a clear message. */
  rows<T extends Row = Row>(name: string): Table<T, string> {
    if (!this.hasTable(name)) {
      throw new Error(`Unknown table "${name}". Declared tables: ${this.allTables.join(', ')}.`);
    }
    return this.table(name) as Table<T, string>;
  }
}

/** Builds the Dexie instance without opening it (Dexie opens lazily). */
export function createPrototypeDatabase(
  source: DatabaseSource,
  backend: StorageBackend = {}
): PrototypeDatabase {
  return new PrototypeDatabase(source, backend);
}

/**
 * Opens (and migrates) the prototype database. Older databases are upgraded
 * through each version's `upgrade`; a database written by NEWER code is never
 * deleted — it is closed and reported as `version-newer`.
 */
export async function openPrototypeDatabase(
  source: DatabaseSource,
  backend: StorageBackend = {}
): Promise<PrototypeDatabase> {
  resolveFactory(backend);
  const db = new PrototypeDatabase(source, backend);
  try {
    await db.open();
  } catch (error) {
    db.close();
    throw mapStorageError(error);
  }
  // Dexie 4 opens newer databases silently (and stores version × 10, plus one
  // per implicit schema bump), so compare the native version ourselves.
  const installed = Math.floor(db.backendDB().version / 10);
  if (installed > db.schemaVersion) {
    db.close();
    throw new StorageError('version-newer', {
      message: `This browser holds data for schema v${installed} of this prototype, but the code only knows v${db.schemaVersion}. Update the prototype or reset its data from DevTools. Nothing was deleted.`,
    });
  }
  return db;
}
