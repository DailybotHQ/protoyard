import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';
import type { SketchCanvas } from '../scenarios/sketches.ts';

export type ReviewEntry = {
  id: string;
  entryId: string;
  personaId: string;
  status: 'todo' | 'in-progress' | 'approved';
  note: string;
  updatedAt: string;
};

/** A screen sketch: one Texuli canvas (`CanvasDocument` JSON), validated by the service on every save. */
export type Sketch = {
  id: string;
  title: string;
  canvas: SketchCanvas;
  updatedBy: string;
  updatedAt: string;
};

export type DesignKitDatabase = Dexie & {
  reviews: EntityTable<ReviewEntry, 'id'>;
  sketches: EntityTable<Sketch, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    { version: 1, stores: { reviews: 'id, entryId, personaId, [personaId+entryId]' } },
    // Version 2 adds screen sketches; existing reviews are untouched.
    { version: 2, stores: { sketches: 'id, updatedAt' } },
  ],
};
