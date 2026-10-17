import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit a shipped
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `AppDatabase` below.
 */

export const ITEM_STATUSES = ['todo', 'doing', 'done'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** A type alias (not an interface) so rows stay assignable to the generic `Row`. */
export type Item = {
  id: string;
  title: string;
  notes: string;
  status: ItemStatus;
  /** Persona id (`py_personas`). */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type AppDatabase = Dexie & {
  items: EntityTable<Item, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: { items: 'id, status, ownerId, updatedAt' } }],
};
