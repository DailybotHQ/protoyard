import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes (`*tagIds` is a multi-entry index, so "documents with this
 * tag" is one indexed query). To add a table, add a NEW version (never edit
 * an old one), bump `storage.schemaVersion` in protoyard.json, and add the
 * typed table to `DesktopDatabase` below.
 *
 * Relationships: folder 1─* document; document *─* tag (through `tagIds`).
 * `authorId` and `updatedBy` reference personas in `py_personas`.
 *
 * Rows are type aliases (not interfaces) so they stay assignable to the
 * generic `Row` the generator returns.
 */

export const TAG_COLORS = ['violet', 'sky', 'emerald', 'amber', 'rose', 'slate'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export type Folder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Tag = {
  id: string;
  name: string;
  color: TagColor;
  createdAt: string;
};

export type Document = {
  id: string;
  folderId: string;
  title: string;
  /** Plain text. Rendered as text, never as HTML (AGENTS rule 7). */
  body: string;
  tagIds: string[];
  pinned: boolean;
  authorId: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DesktopDatabase = Dexie & {
  folders: EntityTable<Folder, 'id'>;
  tags: EntityTable<Tag, 'id'>;
  documents: EntityTable<Document, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        folders: 'id, name, createdAt',
        tags: 'id, &name',
        documents: 'id, folderId, title, updatedAt, *tagIds, authorId',
      },
    },
  ],
};
