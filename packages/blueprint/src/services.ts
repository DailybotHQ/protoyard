import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  type Row,
  ValidationError,
} from '@protoyard/core';
import {
  type Blueprint,
  type BlueprintEntity,
  type BlueprintField,
  entityTable,
} from './schema.ts';
import { FEATURE_TABLES } from './storage.ts';
import { deriveInputSchemas, type EntityInput, fieldLabel, inputProperty } from './validation.ts';

/**
 * Generic entity services: the only way generated screens change data. Every
 * mutation follows the platform contract:
 *
 *   1. `session.assert(<entity>:<action>)` — `:own` variants check the record
 *      (simulated policy, enforced even when the UI is bypassed);
 *   2. zod via `deriveInputSchemas` + `parseInput` (field-keyed errors);
 *   3. `environment.run('<entity>.<operation>')` — latency, offline, failures;
 *   4. one `db.transaction('rw', …)` for the row, its relation checks and every
 *      `onDelete` effect (restrict / cascade / nullify), so a failure writes
 *      nothing.
 *
 * Reads are local IndexedDB reads gated by `<entity>:read`; they do not go
 * through the simulated network, like `liveQuery` reads in prototypes.
 */

/** The Dexie surface the services use (kept structural: no Dexie import). */
interface Collection {
  toArray(): Promise<Row[]>;
}
interface Table {
  get(id: string): Promise<Row | undefined>;
  toArray(): Promise<Row[]>;
  where(index: string): { equals(value: string): Collection; anyOf(values: string[]): Collection };
  put(row: Row): Promise<unknown>;
  bulkPut(rows: Row[]): Promise<unknown>;
  bulkDelete(ids: string[]): Promise<unknown>;
}
interface Db {
  table(name: string): Table;
  transaction<T>(mode: 'rw', tables: string[], fn: () => Promise<T>): Promise<T>;
}

/** Thrown when a record does not exist (or was removed meanwhile). */
export class EntityNotFoundError extends Error {
  readonly code = 'not-found' as const;
  constructor(entity: string, id: string) {
    super(`No ${entity} with id "${id}".`);
    this.name = 'EntityNotFoundError';
  }
}

/** Thrown when `onDelete: 'restrict'` blocks a removal; nothing was deleted. */
export class EntityInUseError extends Error {
  readonly code = 'in-use' as const;
  constructor(entity: string, references: Record<string, number>) {
    const list = Object.entries(references)
      .map(([name, count]) => `${count} ${name}`)
      .join(', ');
    super(`This ${entity} can't be deleted: ${list} still reference it.`);
    this.name = 'EntityInUseError';
  }
}

export interface EntityService {
  readonly entity: BlueprintEntity;
  readonly table: string;
  /** Rows sorted by `defaultSort` (else `createdAt`); soft-deleted rows are hidden. */
  list(): Promise<Row[]>;
  get(id: string): Promise<Row | undefined>;
  create(input: EntityInput): Promise<Row>;
  update(id: string, patch: EntityInput): Promise<Row>;
  remove(id: string): Promise<void>;
  bulkUpdate(ids: readonly string[], patch: EntityInput): Promise<Row[]>;
  /** Removes every id (with `onDelete` effects) and returns how many rows were deleted. */
  bulkRemove(ids: readonly string[]): Promise<number>;
}

export type EntityServices = Record<string, EntityService>;

/** Writes larger than this go through several `bulkPut` calls inside the same transaction. */
export const BULK_CHUNK = 1_000;

interface Reference {
  entity: BlueprintEntity;
  table: string;
  field: BlueprintField & { kind: 'relation' };
  property: string;
}

async function putChunked(table: Table, rows: Row[]) {
  for (let i = 0; i < rows.length; i += BULK_CHUNK) {
    await table.bulkPut(rows.slice(i, i + BULK_CHUNK));
  }
}

export function createEntityServices(
  runtime: PrototypeRuntime,
  blueprint: Blueprint
): EntityServices {
  const db = runtime.db as Db;
  const { session, environment, clock } = runtime;
  const byName = new Map(blueprint.entities.map((e) => [e.name, e]));
  const tables = blueprint.entities.map(entityTable);
  const filesEnabled = blueprint.entities.some((e) => e.features.files);
  const writeTables = filesEnabled
    ? [...tables, FEATURE_TABLES.files, 'py_personas']
    : [...tables, 'py_personas'];

  /** Relation fields (in any entity) that point at `target`. */
  const referencesTo = (target: string): Reference[] =>
    blueprint.entities.flatMap((entity) =>
      entity.fields.flatMap((field) =>
        field.kind === 'relation' && field.to === target
          ? [{ entity, table: entityTable(entity), field, property: inputProperty(field) }]
          : []
      )
    );

  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };

  /** Fails with a field-keyed ValidationError when a referenced row is missing. */
  async function assertReferences(entity: BlueprintEntity, values: EntityInput) {
    const issues: Record<string, string> = {};
    for (const field of entity.fields) {
      const property = inputProperty(field);
      const value = values[property];
      if (value === null || value === undefined) continue;
      const table =
        field.kind === 'relation'
          ? entityTable(byName.get(field.to) as BlueprintEntity)
          : field.kind === 'persona'
            ? 'py_personas'
            : field.kind === 'file' && filesEnabled
              ? FEATURE_TABLES.files
              : null;
      if (!table) continue;
      const ids = Array.isArray(value) ? (value as string[]) : [value as string];
      for (const id of ids) {
        if (!(await db.table(table).get(id))) {
          issues[property] = `${fieldLabel(field)} not found`;
          break;
        }
      }
    }
    if (Object.keys(issues).length > 0) throw new ValidationError(issues);
  }

  /**
   * Deletes `ids` of `entity` and applies every `onDelete` rule in the current
   * transaction: cascades are followed first, then restrict blocks and
   * nullify clears references from rows that survive.
   */
  async function deleteWithEffects(entity: BlueprintEntity, ids: readonly string[]) {
    const doomed = new Map<string, Set<string>>();
    const queue: Array<[BlueprintEntity, string[]]> = [[entity, [...ids]]];
    while (queue.length > 0) {
      const [current, batch] = queue.shift() as [BlueprintEntity, string[]];
      const set = doomed.get(current.name) ?? new Set<string>();
      doomed.set(current.name, set);
      const fresh = batch.filter((id) => !set.has(id));
      for (const id of fresh) set.add(id);
      if (fresh.length === 0) continue;
      for (const ref of referencesTo(current.name)) {
        if (ref.field.onDelete !== 'cascade') continue;
        const rows = await db.table(ref.table).where(ref.property).anyOf(fresh).toArray();
        if (rows.length > 0) queue.push([ref.entity, rows.map((r) => r.id)]);
      }
    }

    const blocked: Record<string, number> = {};
    const nullified = new Map<string, Map<string, Row>>();
    for (const [name, set] of doomed) {
      const removed = [...set];
      for (const ref of referencesTo(name)) {
        if (ref.field.onDelete === 'cascade') continue;
        const survivors = (
          await db.table(ref.table).where(ref.property).anyOf(removed).toArray()
        ).filter((row) => !doomed.get(ref.entity.name)?.has(row.id));
        if (survivors.length === 0) continue;
        if (ref.field.onDelete === 'restrict') {
          blocked[ref.entity.plural] = (blocked[ref.entity.plural] ?? 0) + survivors.length;
          continue;
        }
        const pending = nullified.get(ref.table) ?? new Map<string, Row>();
        nullified.set(ref.table, pending);
        for (const row of survivors) {
          const next = { ...(pending.get(row.id) ?? row) };
          const value = next[ref.property];
          next[ref.property] = Array.isArray(value)
            ? (value as string[]).filter((id) => !set.has(id))
            : null;
          next.updatedAt = clock.now().toISOString();
          pending.set(row.id, next);
        }
      }
    }
    if (Object.keys(blocked).length > 0) throw new EntityInUseError(entity.name, blocked);

    for (const [table, rows] of nullified) await putChunked(db.table(table), [...rows.values()]);
    let count = 0;
    for (const [name, set] of doomed) {
      count += set.size;
      await db.table(entityTable(byName.get(name) as BlueprintEntity)).bulkDelete([...set]);
    }
    return count;
  }

  function serviceFor(entity: BlueprintEntity): EntityService {
    const table = entityTable(entity);
    const cap = (action: string) => `${entity.name}:${action}`;
    const op = (name: string) => `${entity.name}.${name}`;
    const schemas = () => deriveInputSchemas(entity);
    const ownerField = entity.fields.find((f) => f.name === entity.ownerField);
    const ownerProperty = ownerField ? inputProperty(ownerField) : undefined;
    const sort = entity.defaultSort ?? { field: 'createdAt', direction: 'asc' as const };
    const sortField = entity.fields.find((f) => f.name === sort.field);
    const sortProperty = sortField ? inputProperty(sortField) : sort.field;

    /** `:own` actions fall back to the record rule; denial names the full capability. */
    const assertOn = (action: 'update' | 'delete', row: Row) => {
      if (session.can(cap(action)) || session.can(cap(`${action}:own`), row)) return;
      session.assert(cap(action), row);
    };

    const load = async (id: string) => {
      const row = await db.table(table).get(id);
      if (!row || row.deletedAt) throw new EntityNotFoundError(entity.name, id);
      return row;
    };

    const visible = (row: Row) => !row.deletedAt;

    return {
      entity,
      table,
      async list() {
        session.assert(cap('read'));
        const rows = (await db.table(table).toArray()).filter(visible);
        const dir = sort.direction === 'desc' ? -1 : 1;
        return rows.sort((a, b) => {
          const x = a[sortProperty] as string | number | null | undefined;
          const y = b[sortProperty] as string | number | null | undefined;
          if (x === y) return a.id < b.id ? -1 : 1;
          if (x === null || x === undefined) return 1;
          if (y === null || y === undefined) return -1;
          return (x < y ? -1 : 1) * dir;
        });
      },

      async get(id) {
        session.assert(cap('read'));
        const row = await db.table(table).get(id);
        return row && visible(row) ? row : undefined;
      },

      async create(input) {
        session.assert(cap('create'));
        const values = parseInput(schemas().create, input);
        if (
          ownerProperty &&
          (values[ownerProperty] === null || values[ownerProperty] === undefined)
        ) {
          values[ownerProperty] = actorId();
        }
        return environment.run(op('create'), () =>
          db.transaction('rw', writeTables, async () => {
            await assertReferences(entity, values);
            const now = clock.now().toISOString();
            const row: Row = {
              ...values,
              id: createRuntimeId(entity.name.replace(/-/g, '_')),
              createdAt: now,
              updatedAt: now,
            };
            await db.table(table).put(row);
            return row;
          })
        );
      },

      async update(id, patch) {
        const existing = await load(id);
        assertOn('update', existing);
        const values = parseInput(schemas().update, patch);
        return environment.run(op('update'), () =>
          db.transaction('rw', writeTables, async () => {
            const current = await load(id);
            await assertReferences(entity, values);
            const row: Row = { ...current, ...values, id, updatedAt: clock.now().toISOString() };
            await db.table(table).put(row);
            return row;
          })
        );
      },

      async remove(id) {
        const existing = await load(id);
        assertOn('delete', existing);
        await environment.run(op('remove'), () =>
          db.transaction('rw', writeTables, async () => {
            await load(id);
            await deleteWithEffects(entity, [id]);
          })
        );
      },

      async bulkUpdate(ids, patch) {
        const unique = [...new Set(ids)];
        const existing = await Promise.all(unique.map(load));
        for (const row of existing) assertOn('update', row);
        const values = parseInput(schemas().update, patch);
        return environment.run(op('bulkUpdate'), () =>
          db.transaction('rw', writeTables, async () => {
            await assertReferences(entity, values);
            const now = clock.now().toISOString();
            const current = await Promise.all(unique.map(load));
            const rows = current.map((row) => ({ ...row, ...values, id: row.id, updatedAt: now }));
            await putChunked(db.table(table), rows);
            return rows;
          })
        );
      },

      async bulkRemove(ids) {
        const unique = [...new Set(ids)];
        const existing = await Promise.all(unique.map(load));
        for (const row of existing) assertOn('delete', row);
        return environment.run(op('bulkRemove'), () =>
          db.transaction('rw', writeTables, async () => {
            await Promise.all(unique.map(load));
            return deleteWithEffects(entity, unique);
          })
        );
      },
    };
  }

  return Object.fromEntries(blueprint.entities.map((entity) => [entity.name, serviceFor(entity)]));
}
