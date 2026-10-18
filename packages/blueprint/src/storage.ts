import type { IntegrityRules } from '@protoyard/core';
import {
  type Blueprint,
  type BlueprintEntity,
  type BlueprintField,
  entityTable,
} from './schema.ts';

/**
 * Domain tables for optional entity features. They are ordinary stores (not
 * `py_*`) so enabling a feature on a blueprint does not force a reserved-table
 * migration on every existing prototype database.
 */
export const FEATURE_TABLES = {
  audit: 'auditEntries',
  files: 'files',
  notifications: 'notifications',
} as const;

/** Dexie store strings for the feature tables (stable column order). */
export const FEATURE_STORE_STRINGS: Record<
  (typeof FEATURE_TABLES)[keyof typeof FEATURE_TABLES],
  string
> = {
  auditEntries: 'id, entity, recordId, actorId, action, at',
  files: 'id, ownerId, entity, recordId, createdAt',
  notifications: 'id, personaId, readAt, [personaId+readAt], createdAt',
};

/**
 * Row property / Dexie index for a field that always gets a structural column
 * (relations, personas, tags, files). Plain scalar fields are only indexed
 * when listed in `indexes`, `titleField` or `defaultSort`.
 */
export function storeIndexForField(field: BlueprintField): string | undefined {
  switch (field.kind) {
    case 'relation':
      return field.cardinality === 'many' ? `*${field.name}Ids` : `${field.name}Id`;
    case 'persona':
      return `${field.name}Id`;
    case 'tags':
      return `*${field.name}`;
    case 'file':
      return field.multiple ? `*${field.name}Ids` : `${field.name}Id`;
    default:
      return undefined;
  }
}

/** Integrity / row property name for a relation or persona column (no `*`). */
export function relationProperty(field: BlueprintField): string | undefined {
  const index = storeIndexForField(field);
  return index?.replace(/^\*/, '');
}

function indexForNamedField(entity: BlueprintEntity, fieldName: string): string | undefined {
  const field = entity.fields.find((f) => f.name === fieldName);
  if (!field) return undefined;
  return storeIndexForField(field) ?? fieldName;
}

/**
 * Dexie store string for one entity table. Column order is deterministic:
 * `id`, structural field indexes in declaration order, then explicit
 * indexes / title / defaultSort, then `createdAt`, `updatedAt`, and
 * `deletedAt` when soft-delete is on.
 */
export function entityStoreString(entity: BlueprintEntity): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (index: string) => {
    if (seen.has(index)) return;
    seen.add(index);
    parts.push(index);
  };

  add('id');

  for (const field of entity.fields) {
    const index = storeIndexForField(field);
    if (index) add(index);
  }

  for (const name of entity.indexes) {
    const index = indexForNamedField(entity, name);
    if (index) add(index);
  }
  {
    const index = indexForNamedField(entity, entity.titleField);
    if (index) add(index);
  }
  if (entity.defaultSort) {
    const index = indexForNamedField(entity, entity.defaultSort.field);
    if (index) add(index);
  }

  add('createdAt');
  add('updatedAt');
  if (entity.features.softDelete) add('deletedAt');

  return parts.join(', ');
}

function featureFlags(blueprint: Blueprint): {
  audit: boolean;
  files: boolean;
  notifications: boolean;
} {
  return {
    audit: blueprint.entities.some((e) => e.features.audit),
    files: blueprint.entities.some((e) => e.features.files),
    notifications: blueprint.entities.some((e) => e.features.notifications),
  };
}

/**
 * Dexie `stores` map for a blueprint (version-1 shape). Entity tables keep
 * declaration order; feature tables are appended in a fixed name order so two
 * parses of the same blueprint always yield byte-identical JSON.
 */
export function deriveStores(blueprint: Blueprint): Record<string, string> {
  const stores: Record<string, string> = {};
  for (const entity of blueprint.entities) {
    stores[entityTable(entity)] = entityStoreString(entity);
  }

  const flags = featureFlags(blueprint);
  // Fixed order (alphabetical by table name) independent of which entity opted in.
  if (flags.audit) stores[FEATURE_TABLES.audit] = FEATURE_STORE_STRINGS.auditEntries;
  if (flags.files) stores[FEATURE_TABLES.files] = FEATURE_STORE_STRINGS.files;
  if (flags.notifications) {
    stores[FEATURE_TABLES.notifications] = FEATURE_STORE_STRINGS.notifications;
  }
  return stores;
}

/**
 * `IntegrityRules` matching `validateWorld`: every relation / persona / file
 * id column, plus created/updated/(deleted) timestamps and date fields.
 */
export function deriveIntegrity(blueprint: Blueprint): IntegrityRules {
  const byName = new Map(blueprint.entities.map((e) => [e.name, e]));
  const relations: Record<string, Record<string, string>> = {};
  const timestamps: Record<string, readonly string[]> = {};

  for (const entity of blueprint.entities) {
    const table = entityTable(entity);
    const rels: Record<string, string> = {};
    const times: string[] = ['createdAt', 'updatedAt'];

    for (const field of entity.fields) {
      if (field.kind === 'relation') {
        const target = byName.get(field.to);
        if (!target) continue;
        const property = relationProperty(field);
        if (property) rels[property] = entityTable(target);
      } else if (field.kind === 'persona') {
        rels[`${field.name}Id`] = 'py_personas';
      } else if (field.kind === 'file') {
        const property = relationProperty(field);
        if (property) rels[property] = FEATURE_TABLES.files;
      } else if (field.kind === 'date' || field.kind === 'datetime') {
        times.push(field.name);
      }
    }
    if (entity.features.softDelete) times.push('deletedAt');

    if (Object.keys(rels).length > 0) relations[table] = rels;
    timestamps[table] = times;
  }

  const flags = featureFlags(blueprint);
  if (flags.audit) {
    relations[FEATURE_TABLES.audit] = { actorId: 'py_personas' };
    timestamps[FEATURE_TABLES.audit] = ['at'];
  }
  if (flags.files) {
    relations[FEATURE_TABLES.files] = { ownerId: 'py_personas' };
    timestamps[FEATURE_TABLES.files] = ['createdAt'];
  }
  if (flags.notifications) {
    relations[FEATURE_TABLES.notifications] = { personaId: 'py_personas' };
    timestamps[FEATURE_TABLES.notifications] = ['createdAt', 'readAt'];
  }

  return { relations, timestamps };
}
