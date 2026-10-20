import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import { rankBetween } from '@protoyard/views/board';
import type { Page, PageVersion, Space, WikiDatabase } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type PageCreateInput,
  PageCreateSchema,
  type PageMoveInput,
  PageMoveSchema,
  type PageSaveInput,
  PageSaveSchema,
  parse,
  type SpaceCreateInput,
  SpaceCreateSchema,
  ValidationError,
} from './validation.ts';
import { pageTree, wouldCycle } from './wiki.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes in ONE Dexie transaction: a page and its new version are saved together,
 *      so the history never misses a save and never holds one that failed.
 */

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have been changed in another tab.`);
    this.name = 'NotFoundError';
  }
}

export function createServices(runtime: PrototypeRuntime<WikiDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const version = (page: Page, note: string): PageVersion => ({
    id: createRuntimeId('version'),
    pageId: page.id,
    version: page.version,
    title: page.title,
    body: page.body,
    authorId: page.updatedBy,
    note,
    at: page.updatedAt,
  });
  /** The rank after the last sibling under `parentId` in `spaceId`. */
  async function lastRank(spaceId: string, parentId: string | null) {
    const siblings = (await db.pages.where('spaceId').equals(spaceId).toArray())
      .filter((p) => p.parentId === parentId)
      .map((p) => p.rank)
      .sort();
    return rankBetween(siblings.at(-1) ?? null, null);
  }

  return {
    spaces: {
      /** Creates a space with a first "Overview" page (owner only). */
      async create(input: SpaceCreateInput): Promise<Space> {
        session.assert(CAPABILITIES.spacesManage);
        const data = parse(SpaceCreateSchema, input);
        return environment.run('spaces.create', () =>
          db.transaction('rw', db.spaces, db.pages, db.versions, async () => {
            if (await db.spaces.where('key').equals(data.key).first()) {
              throw new ValidationError({ key: `The key ${data.key} is taken` });
            }
            const at = now();
            const space: Space = { id: createRuntimeId('space'), ...data, createdAt: at };
            await db.spaces.add(space);
            const page: Page = {
              id: createRuntimeId('page'),
              spaceId: space.id,
              parentId: null,
              rank: rankBetween(null, null),
              title: 'Overview',
              body: `# ${space.name}\n\n${space.description || 'What this space is for.'}`,
              version: 1,
              createdBy: actorId(),
              createdAt: at,
              updatedBy: actorId(),
              updatedAt: at,
            };
            await db.pages.add(page);
            await db.versions.add(version(page, 'Created'));
            return space;
          })
        );
      },
    },

    pages: {
      /** Adds a page at the end of its parent's children (version 1 in the same transaction). */
      async create(input: PageCreateInput): Promise<Page> {
        session.assert(CAPABILITIES.pagesEdit);
        const data = parse(PageCreateSchema, input);
        return environment.run('pages.create', () =>
          db.transaction('rw', db.spaces, db.pages, db.versions, async () => {
            if (!(await db.spaces.get(data.spaceId))) {
              throw new ValidationError({ spaceId: 'That space no longer exists' });
            }
            if (data.parentId) {
              const parent = await db.pages.get(data.parentId);
              if (!parent || parent.spaceId !== data.spaceId) {
                throw new ValidationError({ parentId: 'The parent page is not in this space' });
              }
            }
            const at = now();
            const page: Page = {
              id: createRuntimeId('page'),
              spaceId: data.spaceId,
              parentId: data.parentId,
              rank: await lastRank(data.spaceId, data.parentId),
              title: data.title,
              body: data.body,
              version: 1,
              createdBy: actorId(),
              createdAt: at,
              updatedBy: actorId(),
              updatedAt: at,
            };
            await db.pages.add(page);
            await db.versions.add(version(page, 'Created'));
            return page;
          })
        );
      },

      /**
       * Saves title and body as a new version. Refuses when someone saved a
       * newer version since the editor opened (`baseVersion`), so no edit is
       * silently overwritten. An unchanged save writes nothing.
       */
      async save(id: string, input: PageSaveInput): Promise<Page> {
        session.assert(CAPABILITIES.pagesEdit);
        const data = parse(PageSaveSchema, input);
        return environment.run('pages.save', () =>
          db.transaction('rw', db.pages, db.versions, async () => {
            const page = await db.pages.get(id);
            if (!page) throw new NotFoundError('page');
            if (page.version !== data.baseVersion) {
              throw new ValidationError({
                body: `Version ${page.version} was saved while you were editing (you started from version ${data.baseVersion}). Copy your text, reload the page and edit again.`,
              });
            }
            if (page.title === data.title && page.body === data.body) return page;
            const next: Page = {
              ...page,
              title: data.title,
              body: data.body,
              version: page.version + 1,
              updatedBy: actorId(),
              updatedAt: now(),
            };
            await db.pages.put(next);
            await db.versions.add(version(next, 'Edited'));
            return next;
          })
        );
      },

      /** Makes an old version current again, as a NEW version (history is never rewritten). */
      async restore(id: string, versionNumber: number): Promise<Page> {
        session.assert(CAPABILITIES.pagesEdit);
        return environment.run('pages.restore', () =>
          db.transaction('rw', db.pages, db.versions, async () => {
            const page = await db.pages.get(id);
            if (!page) throw new NotFoundError('page');
            const old = await db.versions
              .where('[pageId+version]')
              .equals([id, versionNumber])
              .first();
            if (!old) throw new NotFoundError('version');
            if (versionNumber === page.version) {
              throw new ValidationError({ version: 'This is already the current version' });
            }
            const next: Page = {
              ...page,
              title: old.title,
              body: old.body,
              version: page.version + 1,
              updatedBy: actorId(),
              updatedAt: now(),
            };
            await db.pages.put(next);
            await db.versions.add(version(next, `Restored v${versionNumber}`));
            return next;
          })
        );
      },

      /** Moves a page in its space's tree (the TreeView's drag or "Move to…"). */
      async move(id: string, input: PageMoveInput): Promise<void> {
        session.assert(CAPABILITIES.pagesEdit);
        const data = parse(PageMoveSchema, input);
        await environment.run('pages.move', () =>
          db.transaction('rw', db.pages, async () => {
            const page = await db.pages.get(id);
            if (!page) throw new NotFoundError('page');
            const space = await db.pages.where('spaceId').equals(page.spaceId).toArray();
            if (data.parentId !== null && !space.some((p) => p.id === data.parentId)) {
              throw new ValidationError({ parentId: 'Pages move only within their space' });
            }
            if (data.parentId === id || wouldCycle(pageTree(space), id, data.parentId)) {
              throw new ValidationError({ parentId: 'A page cannot move inside itself' });
            }
            for (const r of data.rerank ?? []) {
              const sibling = space.find((p) => p.id === r.id);
              if (sibling && r.id !== id) await db.pages.update(r.id, { rank: r.rank });
            }
            // A move changes where the page sits, not what it says: no new version.
            await db.pages.update(id, { parentId: data.parentId, rank: data.rank });
          })
        );
      },

      /** Deletes a page with no children, and its history. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.pagesEdit);
        await environment.run('pages.remove', () =>
          db.transaction('rw', db.pages, db.versions, async () => {
            const page = await db.pages.get(id);
            if (!page) throw new NotFoundError('page');
            if ((await db.pages.where('parentId').equals(id).count()) > 0) {
              throw new ValidationError({ page: 'Move or delete its subpages first' });
            }
            await db.versions.where('pageId').equals(id).delete();
            await db.pages.delete(id);
          })
        );
      },
    },
  };
}

export type WikiServices = ReturnType<typeof createServices>;
