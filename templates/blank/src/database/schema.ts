import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `BlankDatabase` below.
 */

/** A type alias (not an interface) so rows stay assignable to the generic `Row`. */
export type Note = {
  id: string;
  title: string;
  body: string;
  /** Persona id (`py_personas`). */
  authorId: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BlankDatabase = Dexie & {
  notes: EntityTable<Note, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: { notes: 'id, authorId, pinned, updatedAt' } }],
};
