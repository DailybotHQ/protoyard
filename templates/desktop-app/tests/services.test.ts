import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { DesktopDatabase } from '../src/database/schema.ts';
import {
  createServices,
  matchesQuery,
  RecordNotFoundError,
  sortDocuments,
} from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and opens a new one on the same storage, like a page
 * reload, so these prove persistence, not just in-memory state.
 */

let harness = createHarness<DesktopDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<DesktopDatabase>(definition);
});

describe('desktop app services on the real runtime', () => {
  it('creates, saves, pins, moves and deletes a document that survives reloads', async () => {
    let runtime = await harness.boot('empty');
    let services = createServices(runtime);
    const inbox = await runtime.db.folders.toCollection().first();
    if (!inbox) throw new Error('the empty scenario has an Inbox');

    const doc = await services.documents.create({ folderId: inbox.id });
    expect(doc).toMatchObject({ title: 'Untitled', body: '', authorId: 'user_0001' });
    const tag = await services.tags.create({ name: '  Ideas ' });
    expect(tag.name).toBe('ideas');
    await services.documents.save(doc.id, {
      title: '  Launch plan ',
      body: 'Ship the beta.',
      tagIds: [tag.id, tag.id],
    });

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect(await runtime.db.documents.get(doc.id)).toMatchObject({
      title: 'Launch plan',
      body: 'Ship the beta.',
      tagIds: [tag.id],
    });
    expect(await runtime.db.documents.where('tagIds').equals(tag.id).count()).toBe(1);

    const projects = await services.folders.create({ name: 'Projects' });
    await services.documents.setPinned(doc.id, true);
    await services.documents.move(doc.id, projects.id);
    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect(await runtime.db.documents.get(doc.id)).toMatchObject({
      pinned: true,
      folderId: projects.id,
    });

    await services.documents.remove(doc.id);
    runtime = await harness.reload(runtime);
    expect(await runtime.db.documents.get(doc.id)).toBeUndefined();
    await expect(createServices(runtime).documents.remove(doc.id)).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
  });

  it('reports field errors and rejects unknown tags and folders', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const doc = await runtime.db.documents.toCollection().first();
    if (!doc) throw new Error('the active scenario has documents');

    const titleError = await services.documents
      .save(doc.id, { title: ' ', body: '', tagIds: [] })
      .catch((e: unknown) => e);
    expect(titleError).toBeInstanceOf(ValidationError);
    expect((titleError as ValidationError).issues.title).toBe('Give the document a title');

    await expect(
      services.documents.save(doc.id, { title: 'x', body: '', tagIds: ['tag_missing'] })
    ).rejects.toMatchObject({ issues: { tagIds: 'One of these tags was deleted.' } });
    await expect(services.documents.create({ folderId: 'folder_missing' })).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
    const [first] = await runtime.db.tags.orderBy('name').toArray();
    await expect(services.tags.create({ name: first?.name ?? '' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect((await runtime.db.documents.get(doc.id))?.title).toBe(doc.title);
  });

  it('only deletes empty folders, so no document is lost with its folder', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const folder = await runtime.db.folders.toCollection().first();
    if (!folder) throw new Error('the active scenario has folders');
    const inFolder = await runtime.db.documents.where('folderId').equals(folder.id).count();
    expect(inFolder).toBeGreaterThan(0);

    const error = await services.folders.remove(folder.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/Move or delete its \d+ documents? first/);
    expect(await runtime.db.folders.get(folder.id)).toBeDefined();

    const empty = await services.folders.create({ name: 'Scratch' });
    await services.folders.remove(empty.id);
    expect(await runtime.db.folders.get(empty.id)).toBeUndefined();
  });

  it('enforces roles in the service layer, whatever the UI shows', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const doc = await runtime.db.documents.toCollection().first();
    const folder = await runtime.db.folders.toCollection().first();
    if (!doc || !folder) throw new Error('the active scenario has documents');

    await runtime.session.switchActor('user_0003'); // viewer
    await expect(services.documents.create({ folderId: folder.id })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(
      services.documents.save(doc.id, { title: 'Hijack', body: '', tagIds: [] })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.documents.remove(doc.id)).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0002'); // editor: writes, but cannot delete folders
    const scratch = await services.folders.create({ name: 'Scratch' });
    await expect(services.folders.remove(scratch.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    const saved = await services.documents.save(doc.id, { title: 'Edited', body: '', tagIds: [] });
    expect(saved.updatedBy).toBe('user_0002');
  });

  it('writes nothing when the simulated network is offline', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const folder = await runtime.db.folders.toCollection().first();
    if (!folder) throw new Error('the active scenario has folders');
    const before = await runtime.db.documents.count();
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(services.documents.create({ folderId: folder.id })).rejects.toMatchObject({
      code: 'offline',
    });
    expect(await runtime.db.documents.count()).toBe(before);
  });

  it('sorts pinned first, then newest, and searches title and body', () => {
    const base = {
      folderId: 'f',
      body: '',
      tagIds: [],
      authorId: 'u',
      updatedBy: 'u',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const docs = [
      { ...base, id: 'a', title: 'Old', pinned: false, updatedAt: '2026-01-01T00:00:00.000Z' },
      { ...base, id: 'b', title: 'New', pinned: false, updatedAt: '2026-03-01T00:00:00.000Z' },
      {
        ...base,
        id: 'c',
        title: 'Pinned',
        pinned: true,
        updatedAt: '2025-12-01T00:00:00.000Z',
        body: 'Budget',
      },
    ];
    expect(sortDocuments(docs).map((d) => d.id)).toEqual(['c', 'b', 'a']);
    expect(docs.filter((d) => matchesQuery(d, 'budg')).map((d) => d.id)).toEqual(['c']);
    expect(docs.filter((d) => matchesQuery(d, '  ')).length).toBe(3);
  });
});
