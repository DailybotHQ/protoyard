import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/** A component (or pattern) a persona starred. One row per persona + catalog entry. */
export type Favorite = {
  id: string;
  personaId: string;
  /** `CatalogEntry.id`, e.g. `button` or `pattern-kanban`. */
  entryId: string;
  createdAt: string;
};

export type UiKitDatabase = Dexie & {
  favorites: EntityTable<Favorite, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: { favorites: 'id, personaId, entryId, [personaId+entryId]' } }],
};
