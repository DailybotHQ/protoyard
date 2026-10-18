import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type { DesktopDatabase, Document, Folder, Tag } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type DocumentCreateInput,
  DocumentCreateSchema,
  type DocumentSaveInput,
  DocumentSaveSchema,
  type FolderInput,
  FolderInputSchema,
  parse,
  type TagInput,
  TagInputSchema,
  ValidationError,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`), enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes every related row in ONE Dexie transaction.
 * To add a service, follow the same four steps.
 */

/**
 * Not named `NotFoundError`: Dexie re-wraps errors whose name matches one of
 * its own (NotFound, Constraint…) inside a transaction, which would break
 * `instanceof` for callers.
 */
export class RecordNotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have been deleted in another tab.`);
    this.name = 'RecordNotFoundError';
  }
}

/** Newest first, with pinned documents on top. */
export function sortDocuments(documents: readonly Document[]): Document[] {
  return [...documents].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)
  );
}

/** Case-insensitive match on title and body; an empty query matches everything. */
export function matchesQuery(document: Document, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    document.title.toLowerCase().includes(needle) || document.body.toLowerCase().includes(needle)
  );
}

export function createServices(runtime: PrototypeRuntime<DesktopDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };

  return {
    folders: {
      async create(input: FolderInput): Promise<Folder> {
        session.assert(CAPABILITIES.foldersCreate);
        const data = parse(FolderInputSchema, input);
        return environment.run('folders.create', () =>
          db.transaction('rw', db.folders, async () => {
            const at = now();
            const folder: Folder = {
              id: createRuntimeId('folder'),
              name: data.name,
              createdAt: at,
              updatedAt: at,
            };
            await db.folders.add(folder);
            return folder;
          })
        );
      },

      async rename(id: string, input: FolderInput): Promise<void> {
        session.assert(CAPABILITIES.foldersCreate);
        const data = parse(FolderInputSchema, input);
        await environment.run('folders.rename', () =>
          db.transaction('rw', db.folders, async () => {
            if (!(await db.folders.get(id))) throw new RecordNotFoundError('folder');
            await db.folders.update(id, { name: data.name, updatedAt: now() });
          })
        );
      },

      /** Only empty folders can be deleted, so no document is ever lost by accident. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.foldersDelete);
        await environment.run('folders.remove', () =>
          db.transaction('rw', db.folders, db.documents, async () => {
            if (!(await db.folders.get(id))) throw new RecordNotFoundError('folder');
            const count = await db.documents.where('folderId').equals(id).count();
            if (count > 0) {
              throw new ValidationError({
                folder: `Move or delete its ${count} document${count === 1 ? '' : 's'} first.`,
              });
            }
            await db.folders.delete(id);
          })
        );
      },
    },

    documents: {
      async create(input: DocumentCreateInput): Promise<Document> {
        session.assert(CAPABILITIES.documentsCreate);
        const data = parse(DocumentCreateSchema, input);
        return environment.run('documents.create', () =>
          db.transaction('rw', db.folders, db.documents, async () => {
            if (!(await db.folders.get(data.folderId))) throw new RecordNotFoundError('folder');
            const at = now();
            const author = actorId();
            const document: Document = {
              id: createRuntimeId('doc'),
              folderId: data.folderId,
              title: data.title || 'Untitled',
              body: '',
              tagIds: [],
              pinned: false,
              authorId: author,
              updatedBy: author,
              createdAt: at,
              updatedAt: at,
            };
            await db.documents.add(document);
            return document;
          })
        );
      },

      async save(id: string, input: DocumentSaveInput): Promise<Document> {
        session.assert(CAPABILITIES.documentsUpdate);
        const data = parse(DocumentSaveSchema, input);
        return environment.run('documents.save', () =>
          db.transaction('rw', db.documents, db.tags, async () => {
            const existing = await db.documents.get(id);
            if (!existing) throw new RecordNotFoundError('document');
            const tagIds = [...new Set(data.tagIds)];
            const known = await db.tags.bulkGet(tagIds);
            if (known.some((tag) => !tag)) {
              throw new ValidationError({ tagIds: 'One of these tags was deleted.' });
            }
            const next: Document = {
              ...existing,
              title: data.title,
              body: data.body,
              tagIds,
              updatedBy: actorId(),
              updatedAt: now(),
            };
            await db.documents.put(next);
            return next;
          })
        );
      },

      async setPinned(id: string, pinned: boolean): Promise<void> {
        session.assert(CAPABILITIES.documentsUpdate);
        await environment.run('documents.pin', () =>
          db.transaction('rw', db.documents, async () => {
            if (!(await db.documents.get(id))) throw new RecordNotFoundError('document');
            await db.documents.update(id, { pinned, updatedBy: actorId(), updatedAt: now() });
          })
        );
      },

      async move(id: string, folderId: string): Promise<void> {
        session.assert(CAPABILITIES.documentsUpdate);
        await environment.run('documents.move', () =>
          db.transaction('rw', db.documents, db.folders, async () => {
            if (!(await db.documents.get(id))) throw new RecordNotFoundError('document');
            if (!(await db.folders.get(folderId))) throw new RecordNotFoundError('folder');
            await db.documents.update(id, { folderId, updatedBy: actorId(), updatedAt: now() });
          })
        );
      },

      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.documentsDelete);
        await environment.run('documents.remove', () =>
          db.transaction('rw', db.documents, async () => {
            if (!(await db.documents.get(id))) throw new RecordNotFoundError('document');
            await db.documents.delete(id);
          })
        );
      },
    },

    tags: {
      async create(input: TagInput): Promise<Tag> {
        session.assert(CAPABILITIES.tagsCreate);
        const data = parse(TagInputSchema, input);
        return environment.run('tags.create', () =>
          db.transaction('rw', db.tags, async () => {
            if (await db.tags.where('name').equals(data.name).first()) {
              throw new ValidationError({ name: `A tag called “${data.name}” already exists.` });
            }
            const tag: Tag = {
              id: createRuntimeId('tag'),
              name: data.name,
              color: data.color,
              createdAt: now(),
            };
            await db.tags.add(tag);
            return tag;
          })
        );
      },
    },
  };
}

export type DesktopServices = ReturnType<typeof createServices>;
