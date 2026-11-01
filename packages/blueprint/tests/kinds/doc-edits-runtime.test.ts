import { PermissionDeniedError } from '@protoyard/core';
import { createDocEditServices, type DocDocument } from '@protoyard/pages';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../../tests/support/runtime.ts';
import { KIND_PERSONAS, KIND_STORES, kindWorld } from '../../src/kinds/index.ts';
import { definePrototypeFromDoc } from '../../src/kinds/page-doc-runtime.ts';

/**
 * Saved doc edits on the real content-kind runtime (PLAN_008 decision D3):
 * the `docEdits` store, the service contract, reloads, world resets and the
 * upgrade from a version 1 database that had no `docEdits` store.
 */

const doc: DocDocument = {
  id: 'ops-report',
  title: 'Ops report',
  blocks: [
    { type: 'heading', id: 'title', level: 1, text: 'Ops report' },
    { type: 'text', id: 'intro', markdown: 'Original body.' },
  ],
};

const edited: DocDocument = {
  ...doc,
  blocks: [doc.blocks[0]!, { type: 'text', id: 'intro', markdown: 'Saved across reloads.' }],
};

let harnesses: ReturnType<typeof createHarness>[] = [];
afterEach(() => {
  for (const harness of harnesses) harness.closeAll();
  harnesses = [];
});

function harnessFor(namespace: string, indexedDB?: IDBFactory) {
  const harness = createHarness(definePrototypeFromDoc(doc, { namespace }), { indexedDB });
  harnesses.push(harness);
  return harness;
}

describe('doc edits on the kind runtime', () => {
  it('saves an edit that survives a reload of the same world', async () => {
    const harness = harnessFor('bp-docedits-reload');
    const runtime = await harness.boot();
    await createDocEditServices(runtime).save(doc, edited);

    const reloaded = await harness.reload(runtime);
    expect(await createDocEditServices(reloaded).load(doc)).toMatchObject({
      status: 'saved',
      doc: edited,
      personaId: KIND_PERSONAS.presenter,
    });
  });

  it('lets a viewer read saved edits but not save or reset them', async () => {
    const harness = harnessFor('bp-docedits-viewer');
    const runtime = await harness.boot();
    const services = createDocEditServices(runtime);
    await services.save(doc, edited);
    await runtime.session.switchActor(KIND_PERSONAS.viewer);
    await expect(services.save(doc, doc)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.reset(doc)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await services.load(doc)).toMatchObject({ status: 'saved', doc: edited });
  });

  it('goes through environment.run: offline stores nothing', async () => {
    const harness = harnessFor('bp-docedits-offline');
    const runtime = await harness.boot();
    runtime.environment.set({ network: 'offline' });
    await expect(createDocEditServices(runtime).save(doc, edited)).rejects.toThrow();
    runtime.environment.set({ network: 'online' });
    expect(await createDocEditServices(runtime).load(doc)).toEqual({ status: 'none' });
  });

  it('clears saved edits with the rest of the world on a reset', async () => {
    const harness = harnessFor('bp-docedits-reset');
    const runtime = await harness.boot();
    const services = createDocEditServices(runtime);
    await services.save(doc, edited);
    await runtime.scenarios.reset();
    expect(await services.load(doc)).toEqual({ status: 'none' });
  });

  it('upgrades a version 1 database in place: old rows stay, docEdits appears', async () => {
    const indexedDB = new IDBFactory();
    const namespace = 'bp-docedits-upgrade';
    const v2 = definePrototypeFromDoc(doc, { namespace });
    // The version 1 runtime, as shipped before docEdits: no store and no table in its world.
    const v1World = (scenario: Parameters<typeof kindWorld>[0]) => {
      const world = kindWorld(scenario);
      const { docEdits: _dropped, ...tables } = world.tables;
      return { ...world, tables };
    };
    const v1 = {
      ...v2,
      generate: (ctx: { scenario: Parameters<typeof kindWorld>[0] }) => v1World(ctx.scenario),
      generateWorld: async (scenario: Parameters<typeof kindWorld>[0]) => v1World(scenario),
      manifest: { ...v2.manifest, storage: { ...v2.manifest.storage, schemaVersion: 1 } },
      database: {
        versions: [
          {
            version: 1,
            stores: {
              blockStates: KIND_STORES.blockStates,
              formResponses: KIND_STORES.formResponses,
            },
          },
        ],
      },
    };
    const old = createHarness(v1, { indexedDB });
    harnesses.push(old);
    const before = await old.boot();
    const table = (name: string) =>
      (
        before.db as {
          table(n: string): { put(row: unknown): Promise<unknown>; toArray(): Promise<unknown[]> };
        }
      ).table(name);
    await table('blockStates').put({
      key: `${namespace}::claps`,
      documentId: namespace,
      blockId: 'claps',
      state: { count: 3 },
      updatedAt: '2026-06-01T09:00:00.000Z',
    });
    old.closeAll();

    const runtime = await harnessFor(namespace, indexedDB).boot();
    const rows = await (runtime.db as { table(n: string): { toArray(): Promise<unknown[]> } })
      .table('blockStates')
      .toArray();
    expect(rows).toHaveLength(1);
    const services = createDocEditServices(runtime);
    await services.save(doc, edited);
    expect(await services.load(doc)).toMatchObject({ status: 'saved', doc: edited });
  });
});
