// @vitest-environment node

import type { PrototypeRuntime } from '@protoyard/core';
import { describe, expect, it, vi } from 'vitest';
import {
  createDocEditServices,
  DOC_EDITS_TABLE,
  docEditKey,
  docFingerprint,
} from '../src/doc-edits.ts';
import type { DocDocument } from '../src/schema.ts';

const doc: DocDocument = {
  id: 'field-report',
  title: 'Field report',
  blocks: [
    { type: 'heading', id: 'title', level: 1, text: 'Field report' },
    { type: 'text', id: 'intro', markdown: 'Original body.' },
  ],
};

const edited = (markdown: string): DocDocument => ({
  ...doc,
  blocks: [doc.blocks[0]!, { type: 'text', id: 'intro', markdown }],
});

function harness(granted: readonly string[] = ['blocks:interact']) {
  const rows = new Map<string, unknown>();
  const transactionModes: string[] = [];
  const environmentCalls: string[] = [];
  const grants = new Set(granted);
  const runtime = {
    manifest: { storage: { namespace: 'bp-world-one' } },
    db: {
      table(name: string) {
        if (name !== DOC_EDITS_TABLE) throw new Error(`Unknown table: ${name}`);
        return {
          get: async (key: string) => structuredClone(rows.get(key)),
          put: async (row: { key: string }) => {
            rows.set(row.key, structuredClone(row));
          },
          delete: async (key: string) => {
            rows.delete(key);
          },
        };
      },
      async transaction<T>(mode: 'r' | 'rw', _tables: unknown, callback: () => Promise<T>) {
        transactionModes.push(mode);
        return callback();
      },
    },
    session: {
      assert: vi.fn((capability: string) => {
        if (!grants.has(capability)) throw new Error(`Permission denied: ${capability}`);
      }),
      principal: vi.fn(() => ({ persona: { id: 'presenter' } })),
    },
    environment: {
      run: vi.fn(async <T>(operation: string, callback: () => T | Promise<T>) => {
        environmentCalls.push(operation);
        return callback();
      }),
    },
    clock: { now: () => new Date('2030-01-02T03:04:05.000Z') },
  } as unknown as PrototypeRuntime;
  return {
    rows,
    runtime,
    transactionModes,
    environmentCalls,
    services: createDocEditServices(runtime),
  };
}

describe('createDocEditServices', () => {
  it('saves the edited blocks for this doc and world, and loads them back', async () => {
    const { rows, services, transactionModes, environmentCalls } = harness();
    expect(await services.load(doc)).toEqual({ status: 'none' });

    const saved = await services.save(doc, edited('Saved body.'));
    expect(saved).toEqual({ doc: edited('Saved body.'), updatedAt: '2030-01-02T03:04:05.000Z' });
    expect(environmentCalls).toEqual(['docs.saveEdits']);
    expect([...rows.keys()]).toEqual([docEditKey('bp-world-one', 'field-report')]);
    expect(rows.get('bp-world-one::field-report')).toEqual({
      key: 'bp-world-one::field-report',
      documentId: 'bp-world-one',
      docId: 'field-report',
      baseHash: docFingerprint(doc),
      blocks: edited('Saved body.').blocks,
      updatedAt: '2030-01-02T03:04:05.000Z',
      personaId: 'presenter',
    });

    expect(await services.load(doc)).toEqual({
      status: 'saved',
      doc: edited('Saved body.'),
      updatedAt: '2030-01-02T03:04:05.000Z',
      personaId: 'presenter',
    });
    expect(transactionModes).toEqual(['r', 'rw', 'r']);
  });

  it('keeps the doc settings from the doc itself, never from the edit', async () => {
    const { services } = harness();
    const saved = await services.save(doc, { ...edited('Body.'), title: 'Renamed by the edit' });
    expect(saved.doc.title).toBe('Field report');
  });

  it('refuses a viewer, another doc and an invalid body before any write', async () => {
    const viewer = harness([]);
    await expect(viewer.services.save(doc, edited('No.'))).rejects.toThrow(/Permission denied/);
    await expect(viewer.services.reset(doc)).rejects.toThrow(/Permission denied/);

    const { services, rows, environmentCalls } = harness();
    await expect(services.save(doc, { ...edited('x'), id: 'other-doc' })).rejects.toMatchObject({
      issues: { document: 'These edits belong to another doc.' },
    });
    await expect(services.save(doc, { ...doc, blocks: [] })).rejects.toMatchObject({
      issues: { document: expect.any(String) },
    });
    await expect(
      services.save(doc, { ...doc, blocks: [{ type: 'script', code: 'alert(1)' }] })
    ).rejects.toMatchObject({ issues: { document: expect.any(String) } });
    await expect(services.save(doc, null)).rejects.toMatchObject({
      issues: { document: expect.any(String) },
    });
    expect(rows.size).toBe(0);
    expect(environmentCalls).toEqual([]);
  });

  it('reports edits made on an earlier version of the doc as stale', async () => {
    const { services } = harness();
    await services.save(doc, edited('Saved body.'));
    const changed: DocDocument = { ...doc, title: 'Field report, second edition' };
    expect(await services.load(changed)).toEqual({
      status: 'stale',
      updatedAt: '2030-01-02T03:04:05.000Z',
    });
  });

  it('re-validates a stored row as untrusted and never returns a tampered one', async () => {
    const { services, rows } = harness();
    await services.save(doc, edited('Saved body.'));
    const key = 'bp-world-one::field-report';
    const good = rows.get(key) as Record<string, unknown>;

    rows.set(key, { ...good, blocks: [{ type: 'html', html: '<img src=x onerror=alert(1)>' }] });
    expect(await services.load(doc)).toMatchObject({ status: 'invalid' });

    rows.set(key, { ...good, extra: 'field' });
    expect(await services.load(doc)).toMatchObject({ status: 'invalid' });

    rows.set(key, { ...good, docId: 'someone-else' });
    expect(await services.load(doc)).toMatchObject({ status: 'invalid' });

    rows.set(key, { ...good, blocks: Array.from({ length: 5_000 }, () => good.blocks) });
    expect(await services.load(doc)).toMatchObject({ status: 'invalid' });
  });

  it('resets through the environment and says whether there was anything to clear', async () => {
    const { services, environmentCalls } = harness();
    expect(await services.reset(doc)).toBe(false);
    await services.save(doc, edited('Saved body.'));
    expect(await services.reset(doc)).toBe(true);
    expect(await services.load(doc)).toEqual({ status: 'none' });
    expect(environmentCalls).toEqual(['docs.resetEdits', 'docs.saveEdits', 'docs.resetEdits']);
  });

  it('scopes rows by document id, so another world never sees them', async () => {
    const { runtime, services } = harness();
    await services.save(doc, edited('World one.'));
    const otherWorld = createDocEditServices(runtime, { documentId: 'bp-world-two' });
    expect(await otherWorld.load(doc)).toEqual({ status: 'none' });
    expect(await services.load(doc)).toMatchObject({ status: 'saved' });
  });
});
