import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  type Row,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import { blueprintUsesAudit, createAuditWriter } from './audit.ts';
import {
  type CsvParseOptions,
  type CsvRowError,
  type CsvSerializeOptions,
  type CsvValidationResult,
  mapCsvHeaders,
  parseCsv,
  serializeEntityCsv,
} from './csv.ts';
import { createNotificationWriter } from './notifications.ts';
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
  where(index: string): {
    equals(value: string): Collection;
    above(value: string): Collection;
    anyOf(values: string[]): Collection;
  };
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
  /** Soft-deleted rows sorted by the entity default sort; empty when soft delete is disabled. */
  trash(): Promise<Row[]>;
  get(id: string): Promise<Row | undefined>;
  create(input: EntityInput): Promise<Row>;
  update(id: string, patch: EntityInput): Promise<Row>;
  /** Returns an undo token for soft-delete entities; hard-delete entities return undefined. */
  remove(id: string): Promise<string | undefined>;
  /** Restores the complete row set affected by a soft remove before its simulated deadline. */
  restore(undoToken: string): Promise<number>;
  /** Permanently removes a trashed row and its cascade dependents. */
  purge(id: string): Promise<number>;
  bulkUpdate(ids: readonly string[], patch: EntityInput): Promise<Row[]>;
  /** Removes every id (with `onDelete` effects) and returns how many rows were deleted. */
  bulkRemove(ids: readonly string[]): Promise<number>;
  /**
   * Visible rows as CSV text (headers = field labels). Gated by `<entity>:export`.
   * Optional filter narrows the listed set; relation cells are the stored ids.
   */
  exportCsv(filter?: ExportCsvFilter, options?: CsvSerializeOptions): Promise<string>;
  /**
   * CSV import: `mode: 'preview'` (default) validates only; `mode: 'commit'` writes
   * in one transaction (chunks of {@link BULK_CHUNK}). Gated by `<entity>:import`.
   * Relation cells accept a target id or its title. Without `skipInvalid`, any
   * invalid row aborts the commit and writes nothing.
   */
  importCsv(text: string, options?: ImportCsvOptions): Promise<ImportCsvResult>;
}

/** Optional narrow of `list()` before export. */
export interface ExportCsvFilter {
  ids?: readonly string[];
  where?: (row: Row) => boolean;
}

export interface ImportCsvOptions extends CsvParseOptions {
  /** `preview` validates only; `commit` writes (default `preview`). */
  mode?: 'preview' | 'commit';
  /**
   * On commit: write only valid rows when true; when false (default), any
   * invalid row fails the whole import and nothing is written.
   */
  skipInvalid?: boolean;
  serialize?: CsvSerializeOptions;
}

export interface ImportCsvResult extends CsvValidationResult {
  mode: 'preview' | 'commit';
  /** Rows written on a successful commit (empty on preview). */
  created: Row[];
  /** Audit entry ids written for this batch (when `features.audit` is on). */
  auditIds: string[];
}

/** Thrown when commit is requested and invalid rows remain without `skipInvalid`. */
export class ImportCsvError extends Error {
  readonly code = 'import-invalid' as const;
  readonly report: ImportCsvResult;
  constructor(report: ImportCsvResult) {
    super(
      `CSV import has ${report.errors.length} invalid cell(s) across ${report.rowCount} row(s); nothing was written.`
    );
    this.name = 'ImportCsvError';
    this.report = report;
  }
}

export type EntityServices = Record<string, EntityService>;

/** Writes larger than this go through several `bulkPut` calls inside the same transaction. */
export const BULK_CHUNK = 1_000;
export const UNDO_WINDOW_MS = 30_000;

const UndoPayloadSchema = z.strictObject({
  version: z.literal(1),
  entity: z.string().min(1),
  deletedAt: z.string().min(1),
  expiresAt: z.number().finite(),
  rows: z.array(z.strictObject({ entity: z.string().min(1), ids: z.array(z.string().min(1)) })),
  nullified: z.array(
    z.strictObject({
      entity: z.string().min(1),
      id: z.string().min(1),
      fields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()])),
    })
  ),
});
type UndoPayload = z.infer<typeof UndoPayloadSchema>;

class UndoTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UndoTokenError';
  }
}

function encodeUndoToken(payload: UndoPayload): string {
  return `blueprint-undo-v1:${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodeUndoToken(token: string): UndoPayload {
  const prefix = 'blueprint-undo-v1:';
  if (!token.startsWith(prefix)) throw new UndoTokenError('This undo token is invalid.');
  try {
    const result = UndoPayloadSchema.safeParse(
      JSON.parse(decodeURIComponent(token.slice(prefix.length)))
    );
    if (!result.success) throw new UndoTokenError('This undo token is invalid.');
    return result.data;
  } catch (error) {
    if (error instanceof UndoTokenError) throw error;
    throw new UndoTokenError('This undo token is invalid.');
  }
}

interface Reference {
  entity: BlueprintEntity;
  table: string;
  field: BlueprintField & { kind: 'relation' };
  property: string;
}

interface DeleteEffects {
  doomed: Map<string, Set<string>>;
  nullified: Map<string, Map<string, Row>>;
  originalReferences: Map<string, Map<string, Record<string, string | string[] | null>>>;
  blocked: Record<string, number>;
}

interface SoftDeleteResult {
  rows: Array<{ entity: string; ids: string[] }>;
  nullified: UndoPayload['nullified'];
  count: number;
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
  const notificationsEnabled =
    blueprint.notifications.length > 0 || blueprint.entities.some((e) => e.features.notifications);
  const auditEnabled = blueprintUsesAudit(blueprint);
  const writeTables = [
    ...tables,
    ...(filesEnabled ? [FEATURE_TABLES.files] : []),
    ...(notificationsEnabled ? [FEATURE_TABLES.notifications] : []),
    ...(auditEnabled ? [FEATURE_TABLES.audit] : []),
    'py_personas',
    ...(blueprint.notifications.some((rule) => rule.notify.startsWith('role:'))
      ? ['py_memberships']
      : []),
  ];
  const notify = createNotificationWriter(runtime, blueprint);
  const audit = createAuditWriter(runtime, blueprint);

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

  /**
   * Resolves a relation cell to a stored id: exact id match first, then a unique
   * title-field match on the target entity (soft-deleted targets are ignored).
   */
  async function resolveRelationCell(
    field: BlueprintField & { kind: 'relation' },
    raw: string
  ): Promise<string> {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new ValidationError({
        [inputProperty(field)]: `${fieldLabel(field)} is required`,
      });
    }
    const target = byName.get(field.to);
    if (!target) {
      throw new ValidationError({
        [inputProperty(field)]: `${fieldLabel(field)} target is unknown`,
      });
    }
    const targetTable = entityTable(target);
    const byId = await db.table(targetTable).get(trimmed);
    if (byId && !byId.deletedAt) return byId.id;

    const titleField = target.fields.find((f) => f.name === target.titleField);
    const titleProp = titleField ? inputProperty(titleField) : 'id';
    const matches = (await db.table(targetTable).toArray()).filter(
      (row) => !row.deletedAt && String(row[titleProp] ?? '') === trimmed
    );
    if (matches.length === 1) return (matches[0] as Row).id;
    if (matches.length === 0) {
      throw new ValidationError({
        [inputProperty(field)]: `${fieldLabel(field)} not found`,
      });
    }
    throw new ValidationError({
      [inputProperty(field)]: `${fieldLabel(field)} matches more than one ${target.name}`,
    });
  }

  async function resolveImportCell(
    field: BlueprintField | undefined,
    raw: string
  ): Promise<unknown> {
    if (!field) return raw;
    if (field.kind === 'relation') {
      if (raw.trim() === '') return null;
      if (field.cardinality === 'many') {
        const parts = raw
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        const ids: string[] = [];
        for (const part of parts) ids.push(await resolveRelationCell(field, part));
        return ids;
      }
      return resolveRelationCell(field, raw);
    }
    if (field.kind === 'persona') {
      if (raw.trim() === '') return null;
      const trimmed = raw.trim();
      const byId = await db.table('py_personas').get(trimmed);
      if (byId) return byId.id;
      const people = await db.table('py_personas').toArray();
      const matches = people.filter(
        (row) =>
          String(row.name ?? '') === trimmed ||
          String(row.displayName ?? '') === trimmed ||
          String(row.email ?? '') === trimmed
      );
      if (matches.length === 1) return (matches[0] as Row).id;
      if (matches.length === 0) {
        throw new ValidationError({
          [inputProperty(field)]: `${fieldLabel(field)} not found`,
        });
      }
      throw new ValidationError({
        [inputProperty(field)]: `${fieldLabel(field)} matches more than one persona`,
      });
    }
    return raw;
  }

  /**
   * Parse + resolve relations/personas by id or title, then validate each row
   * against the create schema. Does not write.
   */
  async function previewImportCsv(
    entity: BlueprintEntity,
    text: string,
    options: CsvParseOptions = {}
  ): Promise<CsvValidationResult> {
    const matrix = parseCsv(text, options);
    const [headerRow, ...dataRows] = matrix;
    if (!headerRow) {
      return { headers: [], columns: [], valid: [], errors: [], rowCount: 0 };
    }
    const columns = mapCsvHeaders(headerRow, entity);
    const { create } = deriveInputSchemas(entity);
    const valid: EntityInput[] = [];
    const errors: CsvRowError[] = [];
    let rowCount = 0;

    for (let index = 0; index < dataRows.length; index += 1) {
      const cells = dataRows[index] as string[];
      if (cells.every((c) => c.trim() === '')) continue;
      rowCount += 1;
      const rowNumber = index + 1;
      const raw: EntityInput = {};
      try {
        for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
          const col = columns[colIndex];
          if (!col?.property) continue;
          raw[col.property] = await resolveImportCell(col.field, cells[colIndex] ?? '');
        }
        valid.push(parseInput(create, raw));
      } catch (error) {
        if (error instanceof ValidationError) {
          for (const [field, message] of Object.entries(error.issues)) {
            errors.push({ row: rowNumber, field, message });
          }
        } else {
          errors.push({
            row: rowNumber,
            field: 'row',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { headers: headerRow, columns, valid, errors, rowCount };
  }

  /** CSV import commits use the same audit writer as live mutations (diff + redaction). */
  async function writeAuditBatch(
    entity: BlueprintEntity,
    rows: readonly Row[],
    action: 'create' | 'import'
  ): Promise<string[]> {
    if (!entity.features.audit || rows.length === 0) return [];
    const ids: string[] = [];
    for (const row of rows) {
      const entry = await audit({
        action,
        entity,
        recordId: row.id,
        before: null,
        after: row,
      });
      if (entry) ids.push(entry.id);
    }
    return ids;
  }

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
  async function collectDeleteEffects(
    entity: BlueprintEntity,
    ids: readonly string[],
    softDelete = false
  ): Promise<DeleteEffects> {
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
        const rows = (await db.table(ref.table).where(ref.property).anyOf(fresh).toArray()).filter(
          (row) => !softDelete || !row.deletedAt
        );
        if (rows.length > 0) queue.push([ref.entity, rows.map((r) => r.id)]);
      }
    }

    const blocked: Record<string, number> = {};
    const nullified = new Map<string, Map<string, Row>>();
    const originalReferences = new Map<
      string,
      Map<string, Record<string, string | string[] | null>>
    >();
    for (const [name, set] of doomed) {
      const removed = [...set];
      for (const ref of referencesTo(name)) {
        if (ref.field.onDelete === 'cascade') continue;
        const survivors = (
          await db.table(ref.table).where(ref.property).anyOf(removed).toArray()
        ).filter(
          (row) => !doomed.get(ref.entity.name)?.has(row.id) && (!softDelete || !row.deletedAt)
        );
        if (survivors.length === 0) continue;
        if (ref.field.onDelete === 'restrict') {
          blocked[ref.entity.plural] = (blocked[ref.entity.plural] ?? 0) + survivors.length;
          continue;
        }
        const pending = nullified.get(ref.table) ?? new Map<string, Row>();
        nullified.set(ref.table, pending);
        const originals = originalReferences.get(ref.table) ?? new Map();
        originalReferences.set(ref.table, originals);
        for (const row of survivors) {
          const next = { ...(pending.get(row.id) ?? row) };
          const value = next[ref.property];
          const rowOriginals = originals.get(row.id) ?? {};
          if (!(ref.property in rowOriginals)) {
            rowOriginals[ref.property] = Array.isArray(value)
              ? ([...value] as string[])
              : typeof value === 'string'
                ? value
                : null;
          }
          originals.set(row.id, rowOriginals);
          next[ref.property] = Array.isArray(value)
            ? (value as string[]).filter((id) => !set.has(id))
            : null;
          next.updatedAt = clock.now().toISOString();
          pending.set(row.id, next);
        }
      }
    }
    if (Object.keys(blocked).length > 0) throw new EntityInUseError(entity.name, blocked);

    return { doomed, nullified, originalReferences, blocked };
  }

  async function deleteWithEffects(
    entity: BlueprintEntity,
    ids: readonly string[],
    softDeleteAt?: string,
    deletedBy?: string
  ): Promise<number | SoftDeleteResult> {
    const effects = await collectDeleteEffects(entity, ids, softDeleteAt !== undefined);
    for (const [table, rows] of effects.nullified)
      await putChunked(db.table(table), [...rows.values()]);
    let count = 0;
    const undoRows: SoftDeleteResult['rows'] = [];
    if (softDeleteAt !== undefined) {
      for (const [name, set] of effects.doomed) {
        const idsToDelete = [...set];
        const target = byName.get(name) as BlueprintEntity;
        const targetTable = db.table(entityTable(target));
        const updated: Row[] = [];
        for (const id of idsToDelete) {
          const row = await targetTable.get(id);
          if (!row || row.deletedAt) continue;
          updated.push({ ...row, deletedAt: softDeleteAt, deletedBy, updatedAt: softDeleteAt });
        }
        if (updated.length > 0) {
          await putChunked(targetTable, updated);
          undoRows.push({ entity: name, ids: updated.map((row) => row.id) });
          count += updated.length;
        }
      }
      const nullified = [...effects.originalReferences.entries()].flatMap(([targetTable, rows]) => {
        const tableEntity = blueprint.entities.find((item) => entityTable(item) === targetTable);
        if (!tableEntity) return [];
        return [...rows.entries()].map(([id, fields]) => ({
          entity: tableEntity.name,
          id,
          fields,
        }));
      });
      return { rows: undoRows, nullified, count };
    }

    for (const [name, set] of effects.doomed) {
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
    const sortRows = (rows: Row[]) => {
      const dir = sort.direction === 'desc' ? -1 : 1;
      return rows.sort((a, b) => {
        const x = a[sortProperty] as string | number | null | undefined;
        const y = b[sortProperty] as string | number | null | undefined;
        if (x === y) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * dir;
      });
    };

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
        return sortRows(rows);
      },

      async trash() {
        session.assert(cap('read'));
        if (!entity.features.softDelete) return [];
        const rows = await db.table(table).where('deletedAt').above('').toArray();
        return sortRows(rows);
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
            await audit({ action: 'create', entity, recordId: row.id, before: null, after: row });
            await notify({ on: 'create', entity, row });
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
            await audit({
              action: 'update',
              entity,
              recordId: id,
              before: current,
              after: row,
            });
            await notify({ on: 'update', entity, row, previous: current });
            return row;
          })
        );
      },

      async remove(id) {
        const existing = await load(id);
        assertOn('delete', existing);
        if (entity.features.softDelete) {
          return environment.run(op('remove'), () =>
            db.transaction('rw', writeTables, async () => {
              const current = await load(id);
              const deletedAt = clock.now().toISOString();
              const result = await deleteWithEffects(entity, [id], deletedAt, actorId());
              if (typeof result === 'number')
                throw new Error('Soft delete did not create an undo set.');
              await audit({
                action: 'delete',
                entity,
                recordId: id,
                before: current,
                after: { ...current, deletedAt, deletedBy: actorId() },
              });
              const payload: UndoPayload = {
                version: 1,
                entity: entity.name,
                deletedAt,
                expiresAt: clock.nowMs() + UNDO_WINDOW_MS,
                rows: result.rows,
                nullified: result.nullified,
              };
              return encodeUndoToken(payload);
            })
          );
        }
        await environment.run(op('remove'), () =>
          db.transaction('rw', writeTables, async () => {
            const current = await load(id);
            await deleteWithEffects(entity, [id]);
            await audit({
              action: 'delete',
              entity,
              recordId: id,
              before: current,
              after: null,
            });
          })
        );
        return undefined;
      },

      async restore(undoToken) {
        const payload = decodeUndoToken(undoToken);
        if (payload.entity !== entity.name)
          throw new UndoTokenError('This undo token belongs to another entity.');
        if (clock.nowMs() > payload.expiresAt)
          throw new UndoTokenError('The undo window has expired.');
        const rootIds = payload.rows.find((item) => item.entity === entity.name)?.ids ?? [];
        if (rootIds.length !== 1) throw new UndoTokenError('This undo token is invalid.');
        const root = await db.table(table).get(rootIds[0] as string);
        if (!root || root.deletedAt !== payload.deletedAt)
          throw new EntityNotFoundError(entity.name, rootIds[0] as string);
        assertOn('delete', root);
        return environment.run(op('restore'), () =>
          db.transaction('rw', writeTables, async () => {
            if (clock.nowMs() > payload.expiresAt)
              throw new UndoTokenError('The undo window has expired.');
            const restored = new Map<string, Row[]>();
            for (const group of payload.rows) {
              const target = byName.get(group.entity);
              if (!target) throw new UndoTokenError('This undo token is invalid.');
              const targetTable = db.table(entityTable(target));
              const rows = await Promise.all(group.ids.map((rowId) => targetTable.get(rowId)));
              if (rows.some((row) => !row || row.deletedAt !== payload.deletedAt)) {
                throw new UndoTokenError('The rows in this undo set are no longer available.');
              }
              restored.set(
                group.entity,
                rows.map((row) => ({
                  ...(row as Row),
                  deletedAt: null,
                  deletedBy: null,
                  updatedAt: clock.now().toISOString(),
                }))
              );
            }
            const restoredNullifications: Map<string, Map<string, Row>> = new Map();
            for (const item of payload.nullified) {
              const target = byName.get(item.entity);
              if (!target) throw new UndoTokenError('This undo token is invalid.');
              const targetTable = entityTable(target);
              const row = await db.table(targetTable).get(item.id);
              if (!row || row.deletedAt) throw new EntityNotFoundError(target.name, item.id);
              await assertReferences(target, item.fields as EntityInput);
              const rows = restoredNullifications.get(targetTable) ?? new Map<string, Row>();
              rows.set(item.id, { ...row, ...item.fields, updatedAt: clock.now().toISOString() });
              restoredNullifications.set(targetTable, rows);
            }
            for (const [targetTable, rows] of restoredNullifications) {
              await putChunked(db.table(targetTable), [...rows.values()]);
            }
            let count = 0;
            for (const [name, rows] of restored) {
              await putChunked(db.table(entityTable(byName.get(name) as BlueprintEntity)), rows);
              count += rows.length;
            }
            const restoredRoot = restored.get(entity.name)?.[0];
            if (restoredRoot) {
              await audit({
                action: 'restore',
                entity,
                recordId: restoredRoot.id,
                before: root,
                after: restoredRoot,
              });
            }
            return count;
          })
        );
      },

      async purge(id) {
        const existing = await db.table(table).get(id);
        if (!existing?.deletedAt) throw new EntityNotFoundError(entity.name, id);
        session.assert(cap('delete'), existing);
        return environment.run(op('purge'), () =>
          db.transaction('rw', writeTables, async () => {
            const current = await db.table(table).get(id);
            if (!current?.deletedAt) throw new EntityNotFoundError(entity.name, id);
            const deleted = await deleteWithEffects(entity, [id]);
            if (typeof deleted !== 'number') throw new Error('Purge did not hard delete rows.');
            await audit({
              action: 'purge',
              entity,
              recordId: id,
              before: current,
              after: null,
            });
            return deleted;
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
            for (let i = 0; i < rows.length; i += 1) {
              const previous = current[i] as Row;
              const next = rows[i] as Row;
              await audit({
                action: 'update',
                entity,
                recordId: next.id,
                before: previous,
                after: next,
              });
              await notify({ on: 'update', entity, row: next, previous });
            }
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
            const current = await Promise.all(unique.map(load));
            const result = await deleteWithEffects(entity, unique);
            for (const row of current) {
              await audit({
                action: 'delete',
                entity,
                recordId: row.id,
                before: row,
                after: null,
              });
            }
            return typeof result === 'number' ? result : result.count;
          })
        );
      },

      async exportCsv(filter, options) {
        session.assert(cap('export'));
        let rows = await this.list();
        if (filter?.ids && filter.ids.length > 0) {
          const want = new Set(filter.ids);
          rows = rows.filter((row) => want.has(row.id));
        }
        if (filter?.where) rows = rows.filter(filter.where);
        const records = rows.map((row) => {
          const input: EntityInput = {};
          for (const field of entity.fields) {
            const property = inputProperty(field);
            if (property in row) input[property] = row[property];
          }
          return input;
        });
        return serializeEntityCsv(entity, records, options);
      },

      async importCsv(text, options = {}) {
        session.assert(cap('import'));
        const mode = options.mode ?? 'preview';
        const skipInvalid = options.skipInvalid === true;
        const preview = await previewImportCsv(entity, text, options);
        const base: ImportCsvResult = {
          ...preview,
          mode,
          created: [],
          auditIds: [],
        };

        if (mode === 'preview') return base;

        if (preview.errors.length > 0 && !skipInvalid) {
          throw new ImportCsvError(base);
        }
        if (preview.valid.length === 0) {
          return base;
        }

        return environment.run(op('import'), () =>
          db.transaction('rw', writeTables, async () => {
            const actor = actorId();
            const now = clock.now().toISOString();
            const created: Row[] = [];
            for (const values of preview.valid) {
              await assertReferences(entity, values);
              const row: Row = {
                ...values,
                id: createRuntimeId(entity.name.replace(/-/g, '_')),
                createdAt: now,
                updatedAt: now,
              };
              if (
                ownerProperty &&
                (row[ownerProperty] === null || row[ownerProperty] === undefined)
              ) {
                row[ownerProperty] = actor;
              }
              created.push(row);
            }
            await putChunked(db.table(table), created);
            const auditIds = await writeAuditBatch(entity, created, 'import');
            for (const row of created) {
              await notify({ on: 'create', entity, row });
            }
            return {
              ...base,
              mode: 'commit' as const,
              created,
              auditIds,
            };
          })
        );
      },
    };
  }

  return Object.fromEntries(blueprint.entities.map((entity) => [entity.name, serviceFor(entity)]));
}
