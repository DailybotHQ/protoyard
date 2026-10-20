import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `WikiDatabase` below.
 *
 * Relationships: space 1─* page; page 1─* child page (`parentId`, null for a
 * top-level page); page 1─* version. `createdBy`, `updatedBy` and `authorId`
 * reference personas in `py_personas`. Every instant is an ISO 8601 UTC string.
 */

/** A top-level area of the wiki (a team or a product). */
export type Space = {
  id: string;
  /** Short unique key, `ENG`. */
  key: string;
  name: string;
  description: string;
  icon: string;
  createdAt: string;
};

/** A page. `body` is Markdown source, rendered only through the safe parser (never as HTML). */
export type Page = {
  id: string;
  spaceId: string;
  parentId: string | null;
  /** Fractional rank among siblings (`rankBetween` from @protoyard/views/board). */
  rank: string;
  title: string;
  body: string;
  /** The number of the latest version; every save adds one. */
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

/** A saved state of a page. Written in the same transaction as the save that made it. */
export type PageVersion = {
  id: string;
  pageId: string;
  version: number;
  title: string;
  body: string;
  authorId: string;
  /** `Created`, `Edited`, or `Restored v3`. */
  note: string;
  at: string;
};

export type WikiDatabase = Dexie & {
  spaces: EntityTable<Space, 'id'>;
  pages: EntityTable<Page, 'id'>;
  versions: EntityTable<PageVersion, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        spaces: 'id, &key',
        // [spaceId+parentId] cannot index null parents, so the tree reads a whole space by spaceId.
        pages: 'id, spaceId, parentId, updatedAt',
        versions: 'id, pageId, &[pageId+version], at',
      },
    },
  ],
};
