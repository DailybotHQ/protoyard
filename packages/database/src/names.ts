import { type DatabaseDefinition, RESERVED_TABLES } from '@protoyard/core';

/**
 * Every prototype owns exactly two IndexedDB databases. Names are derived
 * from the manifest namespace so prototypes on the same origin (the gallery
 * serves them all from one host) never see each other's data.
 */

export const DATABASE_PREFIX = 'protoyard';

export function dataDatabaseName(namespace: string): string {
  return `${DATABASE_PREFIX}.${namespace}.data`;
}

export function controlDatabaseName(namespace: string): string {
  return `${DATABASE_PREFIX}.${namespace}.control`;
}

export const RESERVED_TABLE_NAMES = Object.keys(
  RESERVED_TABLES
) as readonly (keyof typeof RESERVED_TABLES)[];

/** `py_` belongs to the platform; prototypes cannot declare such tables. */
export const RESERVED_PREFIX = 'py_';

/**
 * Domain tables that exist after applying every version in order. A store
 * set to `null` deletes the table from that version on (Dexie semantics).
 */
export function domainTableNames(definition: DatabaseDefinition): string[] {
  const tables = new Set<string>();
  for (const version of definition.versions) {
    for (const [name, schema] of Object.entries(version.stores)) {
      if (schema === null) tables.delete(name);
      else tables.add(name);
    }
  }
  return [...tables];
}

/** Domain tables followed by the reserved platform tables. */
export function allTableNames(definition: DatabaseDefinition): string[] {
  return [...domainTableNames(definition), ...RESERVED_TABLE_NAMES];
}

export function latestVersion(definition: DatabaseDefinition): number {
  const last = definition.versions[definition.versions.length - 1];
  if (!last) throw new Error('database.versions must declare at least one version');
  return last.version;
}
