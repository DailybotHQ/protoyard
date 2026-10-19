import {
  controlDatabaseName,
  dataDatabaseName,
  type PrototypeDatabase,
  reviewDatabaseName,
} from '@protoyard/database';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { createLocalReviewAdapter } from '../src/adapters/local/index.ts';
import { runAdapterConformance, sampleComment } from './conformance.ts';

let sequence = 0;
const namespace = () => `review-local-${++sequence}`;
const clientId = 'client-conformance';

runAdapterConformance(
  'local IndexedDB',
  () => createLocalReviewAdapter({ namespace: namespace(), clientId }),
  { cleanup: (adapter) => (adapter as ReturnType<typeof createLocalReviewAdapter>).close() }
);

describe('local review adapter', () => {
  it('persists comments after closing and reopening the namespaced database', async () => {
    const ns = namespace();
    const first = createLocalReviewAdapter({ namespace: ns, clientId });
    const comment = await first.put(sampleComment(ns));
    first.close();

    const reopened = createLocalReviewAdapter({ namespace: ns, clientId });
    try {
      expect(await reopened.list(ns)).toEqual([comment]);
    } finally {
      reopened.close();
    }
  });

  it('keeps review data outside scenario data/control databases', async () => {
    const ns = namespace();
    const indexedDB = new IDBFactory();
    const adapter = createLocalReviewAdapter({ namespace: ns, clientId, indexedDB, IDBKeyRange });
    const harness = createHarness<PrototypeDatabase>(createTasksDefinition({ namespace: ns }), {
      indexedDB,
    });
    try {
      await adapter.put(sampleComment(ns));
      const runtime = await harness.boot();
      await runtime.scenarios.load('active-month');
      expect(await adapter.list(ns)).toHaveLength(1);
      expect(reviewDatabaseName(ns)).not.toBe(dataDatabaseName(ns));
      expect(reviewDatabaseName(ns)).not.toBe(controlDatabaseName(ns));
    } finally {
      harness.closeAll();
      adapter.close();
    }
  });

  it('exports and idempotently imports comments for the same namespace', async () => {
    const ns = namespace();
    const source = createLocalReviewAdapter({
      namespace: ns,
      clientId,
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
    const target = createLocalReviewAdapter({
      namespace: ns,
      clientId,
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
    try {
      await source.put(sampleComment(ns));
      const file = await source.exportComments();
      expect(await target.importComments(file)).toBe(1);
      expect(await target.importComments(file)).toBe(0);
      expect(await target.list(ns)).toHaveLength(1);
    } finally {
      source.close();
      target.close();
    }
  });

  it('rejects malformed, oversized, and foreign-namespace files without partial writes', async () => {
    const ns = namespace();
    const adapter = createLocalReviewAdapter({ namespace: ns, clientId });
    const valid = {
      format: 'protoyard-review-comments',
      version: 1,
      namespace: ns,
      slug: ns,
      comments: [sampleComment(ns)],
    };
    try {
      await expect(adapter.importComments(new Blob(['{']))).rejects.toThrow();
      await expect(
        adapter.importComments(new Blob(['x'.repeat(5 * 1024 * 1024 + 1)]))
      ).rejects.toThrow(/5 MB/);
      await expect(
        adapter.importComments(
          new Blob([
            JSON.stringify({
              ...valid,
              namespace: 'foreign-prototype',
            }),
          ])
        )
      ).rejects.toThrow(/different prototype/);
      await expect(
        adapter.importComments(
          new Blob([
            JSON.stringify({
              ...valid,
              slug: 'foreign-slug',
            }),
          ])
        )
      ).rejects.toThrow(/foreign slug/);
      await expect(
        adapter.importComments(
          new Blob([
            JSON.stringify({
              ...valid,
              comments: [...valid.comments, { id: 'invalid' }],
            }),
          ])
        )
      ).rejects.toThrow();
      expect(await adapter.list(ns)).toEqual([]);
    } finally {
      adapter.close();
    }
  });

  it('prevents editing or deleting comments authored by another client', async () => {
    const ns = namespace();
    const owner = createLocalReviewAdapter({ namespace: ns, clientId: 'owner-client' });
    const other = createLocalReviewAdapter({ namespace: ns, clientId: 'other-client' });
    try {
      const stored = await owner.put(
        sampleComment(ns, {
          author: { name: 'Riley Reviewer', clientId: 'owner-client' },
        })
      );
      await expect(other.put({ ...stored, body: 'An unauthorized edit.' })).rejects.toThrow(
        /Only the comment author/
      );
      await expect(other.remove(stored.id)).rejects.toThrow(/Only the comment author/);
      expect((await owner.list(ns))[0]?.body).toBe(stored.body);
    } finally {
      owner.close();
      other.close();
    }
  });
});
