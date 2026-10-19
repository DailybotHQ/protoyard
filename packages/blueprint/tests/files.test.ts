import { type PrototypeRuntime, type Row } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createEntityServices,
  createFileServices,
  deriveIntegrity,
  deriveStores,
  FileUploadError,
  parseBlueprint,
} from '../src/index.ts';

const blueprint = parseBlueprint({
  ...helpdeskBlueprint,
  entities: helpdeskBlueprint.entities.map((entity) =>
    entity.name === 'ticket'
      ? {
          ...entity,
          fields: [
            ...entity.fields,
            {
              name: 'attachments',
              kind: 'file',
              accept: ['text/plain'],
              maxSizeBytes: 8,
              multiple: true,
            },
          ],
          features: { ...entity.features, files: true, softDelete: true },
        }
      : entity
  ),
});

function createDefinition() {
  const definition = createBlueprintDefinition('blueprint-files');
  const generate = definition.generate;
  return {
    ...definition,
    database: {
      ...definition.database,
      versions: definition.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(blueprint) } : version
      ),
    },
    integrity: deriveIntegrity(blueprint),
    async generate(ctx: Parameters<NonNullable<typeof definition.generate>>[0]) {
      const world = await generate(ctx);
      return { ...world, tables: { ...world.tables, files: [] } };
    },
  };
}

let harness = createHarness(createDefinition());
beforeEach(() => {
  harness = createHarness(createDefinition());
});
afterEach(() => harness.closeAll());

interface Table {
  get(id: string): Promise<Row | undefined>;
  toArray(): Promise<Row[]>;
}

const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): Table }).table(name);

describe('blueprint file services', () => {
  it('persists blobs across reload, lists metadata without blobs, and reports simulated progress', async () => {
    const runtime = await harness.boot('owner');
    const files = createFileServices(runtime, blueprint);
    const progress: number[] = [];
    const uploaded = await files.ticket!.upload(
      {
        entity: 'ticket',
        recordId: 'ticket_0001',
        field: 'attachments',
        file: new Blob(['hello'], { type: 'text/plain' }),
        name: 'notes.txt',
      },
      (event) => progress.push(event.percent)
    );

    expect(uploaded).toMatchObject({ name: 'notes.txt', type: 'text/plain', size: 5 });
    expect(progress).toEqual([0, 50, 100]);
    expect(await table(runtime, 'tickets').get('ticket_0001')).toMatchObject({
      attachmentsIds: [uploaded.id],
    });
    expect(await files.ticket!.list('ticket', 'ticket_0001', 'attachments')).toEqual([uploaded]);
    expect(await files.ticket!.list('ticket', 'ticket_0001')).not.toContainEqual(
      expect.objectContaining({ blob: expect.anything() })
    );
    expect((await files.ticket!.get(uploaded.id))?.blob).toBeInstanceOf(Blob);

    const reloaded = await harness.reload(runtime);
    const stored = await createFileServices(reloaded, blueprint).ticket!.get(uploaded.id);
    expect(stored?.blob).toBeInstanceOf(Blob);
    expect(await stored?.blob.text()).toBe('hello');
  });

  it('writes nothing when offline and rejects oversize or unsupported files', async () => {
    const runtime = await harness.boot('owner');
    const files = createFileServices(runtime, blueprint);
    const input = {
      entity: 'ticket',
      recordId: 'ticket_0001',
      field: 'attachments',
      file: new Blob(['small'], { type: 'text/plain' }),
      name: 'small.txt',
    };
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(files.ticket!.upload(input)).rejects.toMatchObject({ code: 'offline' });
    expect(await table(runtime, 'files').toArray()).toEqual([]);
    expect((await table(runtime, 'tickets').get('ticket_0001'))?.attachmentsIds).toBeUndefined();

    await runtime.overrides.set({ environment: { network: 'online' } });
    await expect(
      files.ticket!.upload({ ...input, file: new Blob(['too large!'], { type: 'text/plain' }) })
    ).rejects.toBeInstanceOf(FileUploadError);
    await expect(
      files.ticket!.upload({ ...input, file: new Blob(['no'], { type: 'image/png' }) })
    ).rejects.toMatchObject({ code: 'type-not-allowed' });
    expect(await table(runtime, 'files').toArray()).toEqual([]);
  });

  it('applies both the per-prototype guard and the runtime storage estimate', async () => {
    const runtime = await harness.boot('owner');
    const input = {
      entity: 'ticket',
      recordId: 'ticket_0001',
      field: 'attachments',
      file: new Blob(['1234'], { type: 'text/plain' }),
    };
    await expect(
      createFileServices(runtime, blueprint, { prototypeQuotaBytes: 3 }).ticket!.upload(input)
    ).rejects.toMatchObject({ code: 'quota-exceeded' });

    Object.defineProperty(runtime, 'storage', {
      value: () => ({ backend: 'indexeddb', persistent: true, usageBytes: 99, quotaBytes: 100 }),
    });
    await expect(
      createFileServices(runtime, blueprint).ticket!.upload(input)
    ).rejects.toMatchObject({
      code: 'quota-exceeded',
    });
    expect(await table(runtime, 'files').toArray()).toEqual([]);
  });

  it('excludes binary bytes from JSON snapshots and reports unavailable attachment data after import', async () => {
    const runtime = await harness.boot('owner');
    const files = createFileServices(runtime, blueprint).ticket!;
    const uploaded = await files.upload({
      entity: 'ticket',
      recordId: 'ticket_0001',
      field: 'attachments',
      file: new Blob(['private'], { type: 'text/plain' }),
    });
    const { json } = await runtime.snapshots.exportJson();

    expect(json).not.toContain('private');
    await runtime.snapshots.importJson(json, { restore: true });
    await expect(files.get(uploaded.id)).rejects.toMatchObject({ code: 'data-unavailable' });
  });

  it('removes a file and detaches its id from the entity record', async () => {
    const runtime = await harness.boot('owner');
    const files = createFileServices(runtime, blueprint).ticket!;
    const uploaded = await files.upload({
      entity: 'ticket',
      recordId: 'ticket_0001',
      field: 'attachments',
      file: new Blob(['hello'], { type: 'text/plain' }),
    });

    await expect(files.remove(uploaded.id)).resolves.toBe(true);
    expect(await files.get(uploaded.id)).toBeUndefined();
    expect((await table(runtime, 'tickets').get('ticket_0001'))?.attachmentsIds).toEqual([]);
  });

  it('purging a trashed entity removes its attachments and releases stored quota', async () => {
    const runtime = await harness.boot('owner');
    const files = createFileServices(runtime, blueprint, { prototypeQuotaBytes: 5 }).ticket!;
    const file = await files.upload({
      entity: 'ticket',
      recordId: 'ticket_0001',
      field: 'attachments',
      file: new Blob(['quota'], { type: 'text/plain' }),
    });
    expect((await table(runtime, 'files').toArray()).map((row) => row.id)).toContain(file.id);
    const tickets = createEntityServices(runtime, blueprint).ticket!;
    await tickets.remove('ticket_0001');
    expect((await table(runtime, 'files').toArray()).map((row) => row.id)).toContain(file.id);
    await tickets.purge('ticket_0001');
    expect(await table(runtime, 'files').toArray()).toEqual([]);
    const secondFile = await files.upload({
      entity: 'ticket',
      recordId: 'ticket_0002',
      field: 'attachments',
      file: new Blob(['quota'], { type: 'text/plain' }),
    });
    expect(secondFile.size).toBe(5);
    await tickets.bulkRemove(['ticket_0002']);
    expect(await table(runtime, 'files').toArray()).toEqual([]);
  });
});
