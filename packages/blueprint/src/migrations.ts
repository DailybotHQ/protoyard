import type { DatabaseVersion } from '@protoyard/core';
import {
  type Blueprint,
  type BlueprintEntity,
  type BlueprintField,
  entityTable,
  parseBlueprint,
} from './schema.ts';
import { deriveStores, relationProperty } from './storage.ts';

/** Minimal Dexie transaction surface used by upgrade ops (avoids a dexie dependency). */
interface UpgradeTransaction {
  table(name: string): {
    toArray(): Promise<Record<string, unknown>[]>;
    bulkPut(rows: readonly Record<string, unknown>[]): Promise<unknown>;
    toCollection(): {
      modify(fn: (row: Record<string, unknown>) => void): Promise<unknown>;
    };
  };
}

/**
 * JSON-serializable upgrade steps. Persist these with the blueprint history
 * and turn them into a Dexie `upgrade` via `applyUpgradeOps` /
 * `toDatabaseVersion` so migrations stay data, not opaque functions.
 */
export type UpgradeOp =
  | {
      op: 'backfill';
      table: string;
      /** Row property to set when missing (`undefined`). */
      field: string;
      value: unknown;
    }
  | {
      op: 'renameField';
      table: string;
      from: string;
      to: string;
    }
  | {
      /** Copy every row from `from` into `to` (table rename). */
      op: 'copyTable';
      from: string;
      to: string;
    }
  | {
      /** Replace existing values after an explicitly allowed incompatible schema change. */
      op: 'resetField';
      table: string;
      field: string;
      value: unknown;
    };

export interface DiffBlueprintsOptions {
  /**
   * Allow dropping tables or fields (Dexie store entry `null` for a removed
   * table). Without this, drops throw `MigrationError`.
   */
  allowDrop?: boolean;
  /** Schema version of `prev`; the result uses `fromVersion + 1` (default 1). */
  fromVersion?: number;
  /**
   * Explicit renames that cannot live in the strict blueprint schema.
   * - `tables`: next table name → previous table name
   * - `fields`: `${table}.${nextRowProperty}` → previous row property
   */
  renamedFrom?: {
    tables?: Record<string, string>;
    fields?: Record<string, string>;
  };
}

/** Result of comparing two blueprints: the next Dexie version plus its ops. */
export interface BlueprintMigration {
  version: number;
  stores: Record<string, string | null>;
  ops: readonly UpgradeOp[];
  /** Dexie upgrade callback built from `ops` (same steps every run). */
  upgrade?: (tx: unknown) => Promise<void>;
}

export class MigrationError extends Error {
  readonly code: 'drop-requires-allow' | 'rename-source-missing';
  constructor(code: MigrationError['code'], message: string) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
  }
}

/** Row property stored for a field (`customerId`, tags multi-entry → `tags`, …). */
export function fieldProperty(field: BlueprintField): string {
  return relationProperty(field) ?? field.name;
}

/**
 * Default written when a field is added to an existing table. Prefers the
 * field's declared `default`, otherwise a kind-appropriate empty value so
 * old rows stay readable.
 */
export function defaultForField(field: BlueprintField): unknown {
  if ('default' in field && field.default !== undefined) return field.default;
  switch (field.kind) {
    case 'boolean':
      return false;
    case 'tags':
      return [];
    case 'json':
      return null;
    case 'relation':
      return field.cardinality === 'many' ? [] : null;
    case 'persona':
      return null;
    case 'file':
      return field.multiple ? [] : null;
    case 'integer':
    case 'number':
    case 'money':
      return null;
    default:
      return null;
  }
}

function tablesOf(blueprint: Blueprint): Map<string, BlueprintEntity> {
  const map = new Map<string, BlueprintEntity>();
  for (const entity of blueprint.entities) {
    map.set(entityTable(entity), entity);
  }
  return map;
}

function fieldByProperty(entity: BlueprintEntity): Map<string, BlueprintField> {
  const map = new Map<string, BlueprintField>();
  for (const field of entity.fields) {
    map.set(fieldProperty(field), field);
  }
  return map;
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

function dedupeOps(ops: UpgradeOp[]): UpgradeOp[] {
  const seen = new Set<string>();
  const out: UpgradeOp[] = [];
  for (const op of ops) {
    const key = JSON.stringify(op);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(op);
  }
  return out;
}

function planFieldChanges(args: {
  prevEntity: BlueprintEntity;
  nextEntity: BlueprintEntity;
  prevTable: string;
  nextTable: string;
  fieldRenames: Record<string, string>;
  allowDrop: boolean;
  ops: UpgradeOp[];
}): void {
  const { prevEntity, nextEntity, prevTable, nextTable, fieldRenames, allowDrop, ops } = args;
  const prevByProp = fieldByProperty(prevEntity);
  const nextByProp = fieldByProperty(nextEntity);
  const renameTargets = new Set(
    Object.keys(fieldRenames)
      .filter((key) => key.startsWith(`${nextTable}.`))
      .map((key) => key.slice(nextTable.length + 1))
  );
  const renameSources = new Set(
    Object.entries(fieldRenames)
      .filter(([key]) => key.startsWith(`${nextTable}.`))
      .map(([, from]) => from)
  );

  for (const prevProp of [...prevByProp.keys()].sort()) {
    if (nextByProp.has(prevProp) || renameSources.has(prevProp)) continue;
    if (!allowDrop) {
      throw new MigrationError(
        'drop-requires-allow',
        `Dropping field "${prevProp}" from table "${nextTable}" requires allowDrop: true (migrations never delete user data silently)`
      );
    }
  }

  for (const [key, from] of Object.entries(fieldRenames)) {
    if (!key.startsWith(`${nextTable}.`)) continue;
    const to = key.slice(nextTable.length + 1);
    if (!prevByProp.has(from)) {
      throw new MigrationError(
        'rename-source-missing',
        `renamedFrom.fields["${key}"] points at unknown previous property "${from}" on "${prevTable}"`
      );
    }
    if (!nextByProp.has(to)) {
      throw new MigrationError(
        'rename-source-missing',
        `renamedFrom.fields["${key}"] but next table "${nextTable}" has no property "${to}"`
      );
    }
    ops.push({ op: 'renameField', table: nextTable, from, to });
  }

  for (const [property, previous] of prevByProp) {
    const next = nextByProp.get(property);
    if (!next) continue;
    const kindChanged = previous.kind !== next.kind;
    const removedEnumValues =
      previous.kind === 'enum' && next.kind === 'enum'
        ? previous.values.filter((value) => !next.values.includes(value))
        : [];
    if (!kindChanged && removedEnumValues.length === 0) continue;
    const change = kindChanged
      ? `Changing field "${property}" from ${previous.kind} to ${next.kind}`
      : `Removing enum values from field "${property}"`;
    if (!allowDrop) {
      throw new MigrationError(
        'drop-requires-allow',
        `${change} on table "${nextTable}" requires allowDrop: true`
      );
    }
    const fallback =
      next.kind === 'enum'
        ? next.default && next.values.includes(next.default)
          ? next.default
          : next.values[0]
        : defaultForField(next);
    ops.push({ op: 'resetField', table: nextTable, field: property, value: fallback });
  }

  for (const nextProp of [...nextByProp.keys()].sort()) {
    if (prevByProp.has(nextProp) || renameTargets.has(nextProp)) continue;
    const field = nextByProp.get(nextProp);
    if (!field) continue;
    ops.push({
      op: 'backfill',
      table: nextTable,
      field: nextProp,
      value: defaultForField(field),
    });
  }
}

/**
 * Diff two blueprints into the next `DatabaseVersion` (plus serializable ops).
 * Returns `null` when stores and data shape are unchanged (no version bump).
 *
 * Classifies: add entity, add field (backfill default), add index (store
 * string only), rename via `renamedFrom`, drop (needs `allowDrop` → `null`).
 */
export function diffBlueprints(
  prev: Blueprint,
  next: Blueprint,
  options: DiffBlueprintsOptions = {}
): BlueprintMigration | null {
  const fromVersion = options.fromVersion ?? 1;
  const allowDrop = options.allowDrop === true;
  const tableRenames = options.renamedFrom?.tables ?? {};
  const fieldRenames = options.renamedFrom?.fields ?? {};

  const prevStores = deriveStores(prev);
  const nextStores = deriveStores(next);
  const prevTables = tablesOf(prev);
  const nextTables = tablesOf(next);

  const stores: Record<string, string | null> = {};
  const ops: UpgradeOp[] = [];
  const renameSources = new Set(Object.values(tableRenames));

  // Dropped tables (not a rename source)
  for (const prevTable of sortedKeys(prevStores)) {
    if (nextStores[prevTable] !== undefined) continue;
    if (renameSources.has(prevTable)) continue;
    if (!allowDrop) {
      throw new MigrationError(
        'drop-requires-allow',
        `Dropping table "${prevTable}" requires allowDrop: true (migrations never delete user data silently)`
      );
    }
    stores[prevTable] = null;
  }

  // Table renames: create next, copy rows, drop previous
  for (const nextTable of sortedKeys(tableRenames)) {
    const prevTable = tableRenames[nextTable] as string;
    if (prevStores[prevTable] === undefined) {
      throw new MigrationError(
        'rename-source-missing',
        `renamedFrom.tables["${nextTable}"] points at unknown previous table "${prevTable}"`
      );
    }
    if (nextStores[nextTable] === undefined) {
      throw new MigrationError(
        'rename-source-missing',
        `renamedFrom.tables["${nextTable}"] but next blueprint has no table "${nextTable}"`
      );
    }
    stores[nextTable] = nextStores[nextTable] as string;
    stores[prevTable] = null;
    ops.push({ op: 'copyTable', from: prevTable, to: nextTable });

    const prevEntity = prevTables.get(prevTable);
    const nextEntity = nextTables.get(nextTable);
    if (prevEntity && nextEntity) {
      planFieldChanges({
        prevEntity,
        nextEntity,
        prevTable,
        nextTable,
        fieldRenames,
        allowDrop,
        ops,
      });
    }
  }

  // New and changed tables (excluding rename targets already handled)
  for (const nextTable of sortedKeys(nextStores)) {
    if (tableRenames[nextTable] !== undefined) continue;

    const nextStore = nextStores[nextTable] as string;
    const prevStore = prevStores[nextTable];
    const prevEntity = prevTables.get(nextTable);
    const nextEntity = nextTables.get(nextTable);

    if (prevStore === undefined) {
      stores[nextTable] = nextStore;
      continue;
    }

    if (prevEntity && nextEntity) {
      planFieldChanges({
        prevEntity,
        nextEntity,
        prevTable: nextTable,
        nextTable,
        fieldRenames,
        allowDrop,
        ops,
      });
    }

    if (prevStore !== nextStore) {
      stores[nextTable] = nextStore;
    }
  }

  // softDelete newly enabled → backfill deletedAt (platform column, not a field)
  for (const nextEntity of next.entities) {
    const nextTable = entityTable(nextEntity);
    const prevTable = tableRenames[nextTable] ?? nextTable;
    const prevEntity = prevTables.get(prevTable);
    if (!prevEntity) continue;
    if (nextEntity.features.softDelete && !prevEntity.features.softDelete) {
      ops.push({ op: 'backfill', table: nextTable, field: 'deletedAt', value: null });
      if (stores[nextTable] === undefined && nextStores[nextTable] !== undefined) {
        stores[nextTable] = nextStores[nextTable] as string;
      }
    }
  }

  const uniqueOps = dedupeOps(ops);

  // Ops on an unchanged store string still need a version entry so Dexie runs upgrade.
  for (const op of uniqueOps) {
    if (op.op === 'backfill' || op.op === 'renameField') {
      if (stores[op.table] === undefined && nextStores[op.table] !== undefined) {
        stores[op.table] = nextStores[op.table] as string;
      }
    }
  }

  if (Object.keys(stores).length === 0 && uniqueOps.length === 0) {
    return null;
  }

  const migration: BlueprintMigration = {
    version: fromVersion + 1,
    stores,
    ops: uniqueOps,
  };
  if (uniqueOps.length > 0) {
    migration.upgrade = (tx) => applyUpgradeOps(tx, uniqueOps);
  }
  return migration;
}

/**
 * Runs serializable upgrade ops against a Dexie transaction. Safe to call
 * multiple times on the same ops list (backfill only fills `undefined`).
 */
export async function applyUpgradeOps(tx: unknown, ops: readonly UpgradeOp[]): Promise<void> {
  const transaction = tx as UpgradeTransaction;
  for (const op of ops) {
    if (op.op === 'backfill') {
      await transaction
        .table(op.table)
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          if (row[op.field] === undefined) row[op.field] = op.value;
        });
    } else if (op.op === 'renameField') {
      await transaction
        .table(op.table)
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          if (Object.hasOwn(row, op.from)) {
            if (row[op.to] === undefined) row[op.to] = row[op.from];
            delete row[op.from];
          }
        });
    } else if (op.op === 'copyTable') {
      const rows = await transaction.table(op.from).toArray();
      if (rows.length > 0) {
        await transaction.table(op.to).bulkPut(rows);
      }
    } else if (op.op === 'resetField') {
      await transaction
        .table(op.table)
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          row[op.field] = op.value;
        });
    }
  }
}

/** Core `DatabaseVersion` ready to append to a prototype's `database.versions`. */
export function toDatabaseVersion(migration: BlueprintMigration): DatabaseVersion {
  return {
    version: migration.version,
    stores: migration.stores,
    ...(migration.ops.length > 0
      ? { upgrade: (tx: unknown) => applyUpgradeOps(tx, migration.ops) }
      : {}),
  };
}

/**
 * Builds the full version list: previous versions plus the diff as the tip.
 * When `diffBlueprints` returns null, returns `previous` unchanged.
 */
export function appendMigration(
  previous: readonly DatabaseVersion[],
  migration: BlueprintMigration | null
): DatabaseVersion[] {
  if (!migration) return [...previous];
  return [...previous, toDatabaseVersion(migration)];
}

/**
 * Every database version of a blueprint, rebuilt from its `history`: version 1
 * holds the oldest entry's stores, then each step appends the diff against the
 * previous blueprint (steps that change nothing add no version). Deterministic,
 * so generated prototypes and `protoyard validate` agree without running code.
 */
export function deriveDatabaseVersions(blueprint: Blueprint): DatabaseVersion[] {
  const chain = [
    ...blueprint.history.map((entry) => ({
      blueprint: parseBlueprint(entry.blueprint),
      allowDrop: entry.migrateNext?.allowDrop === true,
    })),
    { blueprint, allowDrop: false },
  ];
  const first = chain[0] as (typeof chain)[number];
  let versions: DatabaseVersion[] = [{ version: 1, stores: deriveStores(first.blueprint) }];
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1] as (typeof chain)[number];
    const migration = diffBlueprints(
      prev.blueprint,
      (chain[i] as (typeof chain)[number]).blueprint,
      {
        fromVersion: (versions[versions.length - 1] as DatabaseVersion).version,
        allowDrop: prev.allowDrop,
      }
    );
    versions = appendMigration(versions, migration);
  }
  return versions;
}

/** The latest schema version `deriveDatabaseVersions` produces. */
export function latestSchemaVersion(blueprint: Blueprint): number {
  const versions = deriveDatabaseVersions(blueprint);
  return (versions[versions.length - 1] as DatabaseVersion).version;
}
