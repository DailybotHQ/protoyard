import { createRuntimeId, type PrototypeRuntime, type Row } from '@protoyard/core';
import type { Blueprint, BlueprintEntity, BlueprintField } from './schema.ts';
import { FEATURE_TABLES } from './storage.ts';
import { inputProperty } from './validation.ts';

/** Placeholder stored instead of a sensitive field's real value. */
export const AUDIT_REDACTED = '[redacted]';

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'purge' | 'import';

export interface AuditChange {
  before: unknown;
  after: unknown;
}

export interface AuditEntry extends Row {
  id: string;
  entity: string;
  recordId: string;
  actorId: string;
  action: AuditAction;
  at: string;
  /**
   * Monotonic per writer instance so entries that share the same simulated
   * `at` still sort newest-first.
   */
  seq: number;
  /** Only fields that changed; sensitive values are `AUDIT_REDACTED`. */
  changes: Record<string, AuditChange>;
}

interface Collection {
  toArray(): Promise<Row[]>;
}
interface Table {
  get(id: string): Promise<Row | undefined>;
  toArray(): Promise<Row[]>;
  where(index: string): {
    equals(value: string): Collection;
  };
  put(row: Row): Promise<unknown>;
}
interface Db {
  table(name: string): Table;
  transaction<T>(mode: 'rw', tables: string[], fn: () => Promise<T>): Promise<T>;
}

const META = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy']);

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => same(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function redact(field: BlueprintField | undefined, value: unknown): unknown {
  if (value === undefined) return null;
  if (field?.sensitive) return AUDIT_REDACTED;
  return value;
}

/**
 * Field-level diff for an audit row. Only changed input properties are listed;
 * `sensitive` fields store {@link AUDIT_REDACTED} instead of the real value.
 * Platform meta columns (`id`, timestamps, soft-delete markers) are omitted.
 */
export function auditDiff(
  entity: BlueprintEntity,
  before: Row | null | undefined,
  after: Row | null | undefined
): Record<string, AuditChange> {
  const byProp = new Map(entity.fields.map((field) => [inputProperty(field), field]));
  const keys = new Set<string>([...byProp.keys()]);
  if (before) for (const key of Object.keys(before)) if (!META.has(key)) keys.add(key);
  if (after) for (const key of Object.keys(after)) if (!META.has(key)) keys.add(key);

  const changes: Record<string, AuditChange> = {};
  for (const key of [...keys].sort()) {
    if (META.has(key)) continue;
    const field = byProp.get(key);
    const prev = before ? before[key] : undefined;
    const next = after ? after[key] : undefined;
    if (same(prev, next)) continue;
    // Create: skip pure empties on the "before" side only when both empty.
    if (before == null && (next === null || next === undefined)) continue;
    changes[key] = {
      before: before == null ? null : redact(field, prev),
      after: after == null ? null : redact(field, next),
    };
  }
  return changes;
}

export interface AuditEvent {
  readonly action: AuditAction;
  readonly entity: BlueprintEntity;
  readonly recordId: string;
  readonly before?: Row | null;
  readonly after?: Row | null;
}

/**
 * Writes audit rows into the caller's open mutation transaction.
 * No-op when the entity does not enable `features.audit`.
 */
export function createAuditWriter(runtime: PrototypeRuntime, blueprint: Blueprint) {
  const db = runtime.db as Db;
  const enabled = new Set(
    blueprint.entities.filter((entity) => entity.features.audit).map((entity) => entity.name)
  );
  let seq = 0;

  return async (event: AuditEvent): Promise<AuditEntry | null> => {
    if (!enabled.has(event.entity.name)) return null;
    const actorId = runtime.session.principal()?.persona.id;
    if (!actorId) throw new Error('No active persona. Load a scenario first.');

    const changes = auditDiff(event.entity, event.before, event.after);
    // Always record the action even when the diff is empty (e.g. no-op update
    // is rare; delete/create still carry structural meaning).
    const entry: AuditEntry = {
      id: createRuntimeId('audit'),
      entity: event.entity.name,
      recordId: event.recordId,
      actorId,
      action: event.action,
      at: runtime.clock.now().toISOString(),
      seq: ++seq,
      changes,
    };
    await db.table(FEATURE_TABLES.audit).put(entry);
    return entry;
  };
}

export interface BlueprintAuditService {
  /** Newest-first history for one record. Requires `<entity>:read`. */
  listForRecord(entityName: string, recordId: string): Promise<AuditEntry[]>;
  /** Newest-first entries across every audited entity (capped). Requires any audited entity read. */
  listRecent(limit?: number): Promise<AuditEntry[]>;
}

/** Read API for the shared `auditEntries` table. */
export function createAuditService(
  runtime: PrototypeRuntime,
  blueprint: Blueprint
): BlueprintAuditService {
  const db = runtime.db as Db;
  const byName = new Map(blueprint.entities.map((entity) => [entity.name, entity]));
  const audited = blueprint.entities.filter((entity) => entity.features.audit);

  const assertCanRead = (entityName: string) => {
    const entity = byName.get(entityName);
    if (!entity?.features.audit) {
      throw new Error(`Entity "${entityName}" does not enable audit logging.`);
    }
    runtime.session.assert(`${entity.name}:read`);
  };

  const sortNewest = (rows: AuditEntry[]) =>
    rows.sort((a, b) => {
      if (a.at !== b.at) return a.at < b.at ? 1 : -1;
      const seqA = typeof a.seq === 'number' ? a.seq : 0;
      const seqB = typeof b.seq === 'number' ? b.seq : 0;
      if (seqA !== seqB) return seqB - seqA;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });

  return {
    async listForRecord(entityName, recordId) {
      assertCanRead(entityName);
      const rows = (await db.table(FEATURE_TABLES.audit).toArray()) as AuditEntry[];
      return sortNewest(
        rows.filter((row) => row.entity === entityName && row.recordId === recordId)
      );
    },
    async listRecent(limit = 50) {
      if (audited.length === 0) return [];
      // Any audited entity the actor can read unlocks the feed.
      const allowed = new Set<string>();
      for (const entity of audited) {
        if (runtime.session.can(`${entity.name}:read`)) allowed.add(entity.name);
      }
      if (allowed.size === 0) {
        const first = audited[0];
        if (first) runtime.session.assert(`${first.name}:read`);
      }
      const rows = (await db.table(FEATURE_TABLES.audit).toArray()) as AuditEntry[];
      return sortNewest(rows.filter((row) => allowed.has(row.entity))).slice(0, Math.max(0, limit));
    },
  };
}

/** True when at least one entity opts into audit logging. */
export function blueprintUsesAudit(blueprint: Blueprint): boolean {
  return blueprint.entities.some((entity) => entity.features.audit);
}
