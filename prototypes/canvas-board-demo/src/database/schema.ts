import type { DatabaseDefinition } from '@protoyard/core';
import type { CanvasDocument } from '@texuli/canvas/model';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `CanvasBoardDatabase` below.
 */

/** A type alias (not an interface) so rows stay assignable to the generic `Row`. */
export type Board = {
  id: string;
  title: string;
  /** The board's canvas (Texuli's canvas format), validated before every write and paint. */
  canvas: CanvasDocument;
  /** Persona id (`py_personas`). */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasBoardDatabase = Dexie & {
  boards: EntityTable<Board, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: { boards: 'id, ownerId, updatedAt' } }],
};
