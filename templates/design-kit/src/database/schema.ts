import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

export type ReviewEntry = {
  id: string;
  entryId: string;
  personaId: string;
  status: 'todo' | 'in-progress' | 'approved';
  note: string;
  updatedAt: string;
};

export type DesignKitDatabase = Dexie & { reviews: EntityTable<ReviewEntry, 'id'> };

export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: { reviews: 'id, entryId, personaId, [personaId+entryId]' } }],
};
