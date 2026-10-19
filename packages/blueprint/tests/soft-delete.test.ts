import { type PrototypeRuntime, type Row } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { createEntityServices } from '../src/services.ts';
import { deriveStores } from '../src/storage.ts';

const softDeleteBlueprint = structuredClone(helpdeskBlueprint);
for (const entity of softDeleteBlueprint.entities) {
  if (entity.name === 'customer' || entity.name === 'ticket') entity.features.softDelete = true;
}

function createSoftDeleteDefinition() {
  const definition = createBlueprintDefinition();
  return {
    ...definition,
    database: {
      ...definition.database,
      versions: definition.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(softDeleteBlueprint) } : version
      ),
    },
  };
}

let harness = createHarness(createSoftDeleteDefinition());
beforeEach(() => {
  harness = createHarness(createSoftDeleteDefinition());
});
afterEach(() => harness.closeAll());

interface RowsTable {
  get(id: string): Promise<Row | undefined>;
  put(row: Row): Promise<unknown>;
}

function rowsTable(runtime: PrototypeRuntime, name: string): RowsTable {
  return (runtime.db as { table(name: string): RowsTable }).table(name);
}

async function boot(scenario = 'owner') {
  const runtime = await harness.boot(scenario);
  return { runtime, services: createEntityServices(runtime, softDeleteBlueprint) };
}

describe('blueprint soft delete, restore, and purge', () => {
  it('soft-deletes cascades, hides them from normal reads, and restores the same set after reload', async () => {
    const { runtime, services } = await boot();
    const originalNote = await rowsTable(runtime, 'notes').get('note_0001');
    const undoToken = await services.customer!.remove('customer_0002');
    expect(await rowsTable(runtime, 'customers').get('customer_0002')).toMatchObject({
      deleteGroupRows: expect.arrayContaining([
        { entity: 'customer', ids: ['customer_0002'] },
        { entity: 'ticket', ids: ['ticket_0003', 'ticket_0004'] },
      ]),
    });

    expect(undoToken).toMatch(/^blueprint-undo-v2:/);
    expect(await services.customer!.get('customer_0002')).toBeUndefined();
    expect((await services.customer!.trash()).map((row) => row.id)).toEqual(['customer_0002']);
    expect((await services.ticket!.list()).map((row) => row.id)).not.toContain('ticket_0003');
    expect((await services.ticket!.trash()).map((row) => row.id)).toEqual([
      'ticket_0003',
      'ticket_0004',
    ]);
    expect(await rowsTable(runtime, 'customers').get('customer_0002')).toMatchObject({
      deletedAt: runtime.clock.now().toISOString(),
      deletedBy: runtime.session.principal()?.persona.id,
    });
    expect(await rowsTable(runtime, 'notes').get('note_0001')).toMatchObject({
      ticketId: null,
      relatedIds: ['ticket_0005'],
    });

    const reloaded = await harness.reload(runtime);
    const restoredCount = await createEntityServices(
      reloaded,
      softDeleteBlueprint
    ).customer!.restore(undoToken as string);

    expect(restoredCount).toBe(3);
    expect(
      await createEntityServices(reloaded, softDeleteBlueprint).customer!.get('customer_0002')
    ).toBeTruthy();
    expect(await createEntityServices(reloaded, softDeleteBlueprint).ticket!.list()).toHaveLength(
      6
    );
    expect(await rowsTable(reloaded, 'notes').get('note_0001')).toMatchObject({
      ticketId: originalNote?.ticketId,
      relatedIds: originalNote?.relatedIds,
    });
  });

  it('expires undo by simulated time and leaves the trashed rows untouched', async () => {
    const { runtime, services } = await boot();
    const undoToken = await services.customer!.remove('customer_0002');
    runtime.clock.setTime(new Date(runtime.clock.nowMs() + 30_001));

    await expect(services.customer!.restore(undoToken as string)).rejects.toThrow(
      'undo window has expired'
    );
    expect(await services.customer!.get('customer_0002')).toBeUndefined();
    expect((await services.customer!.trash()).map((row) => row.id)).toContain('customer_0002');
  });

  it('restores cascade rows from the Trash view through the entity service', async () => {
    const { runtime, services } = await boot();
    const originalNote = await rowsTable(runtime, 'notes').get('note_0001');
    await services.customer!.remove('customer_0002');

    await expect(services.customer!.restoreTrashed('customer_0002')).resolves.toBe(3);
    expect(await services.customer!.get('customer_0002')).toBeTruthy();
    expect(await services.ticket!.get('ticket_0003')).toBeTruthy();
    expect(await services.ticket!.get('ticket_0004')).toBeTruthy();
    expect(await services.customer!.trash()).toHaveLength(0);
    expect(await rowsTable(runtime, 'notes').get('note_0001')).toMatchObject({
      ticketId: originalNote?.ticketId,
      relatedIds: originalNote?.relatedIds,
    });
  });

  it('does not accept client supplied undo row or field overrides', async () => {
    const { runtime, services } = await boot();
    const undoToken = await services.customer!.remove('customer_0002');
    const invoiceBefore = await rowsTable(runtime, 'invoices').get('invoice_0001');
    const forged = `blueprint-undo-v1:${encodeURIComponent(
      JSON.stringify({
        version: 1,
        entity: 'customer',
        deletedAt: runtime.clock.now().toISOString(),
        expiresAt: runtime.clock.nowMs() + 30_000,
        rows: [{ entity: 'customer', ids: ['customer_0002'] }],
        nullified: [{ entity: 'invoice', id: 'invoice_0001', fields: { number: 'FORGED' } }],
      })
    )}`;

    await expect(services.customer!.restore(forged)).rejects.toThrow(/invalid/);
    expect(await rowsTable(runtime, 'invoices').get('invoice_0001')).toEqual(invoiceBefore);
    expect(undoToken).toMatch(/^blueprint-undo-v2:/);
  });

  it('keeps overlapping nullification groups and does not overwrite a later edit', async () => {
    const { runtime, services } = await boot();
    await rowsTable(runtime, 'notes').put({
      id: 'note_group_test',
      body: 'links',
      ticketId: 'ticket_0003',
      relatedIds: ['ticket_0003', 'ticket_0005'],
      createdAt: runtime.clock.now().toISOString(),
      updatedAt: runtime.clock.now().toISOString(),
    });
    const first = await services.ticket!.remove('ticket_0003');
    await rowsTable(runtime, 'notes').put({
      ...(await rowsTable(runtime, 'notes').get('note_group_test'))!,
      ticketId: 'ticket_0004',
    });
    const noteAfterEdit = await rowsTable(runtime, 'notes').get('note_group_test');
    const second = await services.ticket!.remove('ticket_0005');
    await services.ticket!.restore(first as string);
    expect(await rowsTable(runtime, 'notes').get('note_group_test')).toMatchObject({
      ticketId: noteAfterEdit?.ticketId,
      relatedIds: ['ticket_0003'],
    });
    await services.ticket!.restore(second as string);
    const finalNote = await rowsTable(runtime, 'notes').get('note_group_test');
    expect(finalNote?.ticketId).toBe(noteAfterEdit?.ticketId);
    expect(finalNote?.relatedIds).toEqual(['ticket_0003', 'ticket_0005']);
  });

  it('rejects creating a relation to a soft-deleted target', async () => {
    const { services } = await boot();
    await services.customer!.remove('customer_0002');
    await expect(
      services.ticket!.create({
        subject: 'Reference deleted customer',
        customerId: 'customer_0002',
      })
    ).rejects.toMatchObject({ issues: { customerId: 'Customer not found' } });
  });

  it('requires the entity delete capability before permanently purging trash', async () => {
    const { runtime, services } = await boot('member');
    const ticket = await services.ticket!.create({
      subject: 'Owned ticket',
      customerId: 'customer_0001',
    });
    await rowsTable(runtime, 'tickets').put({
      ...ticket,
      deletedAt: runtime.clock.now().toISOString(),
      deletedBy: runtime.session.principal()?.persona.id,
    });

    await expect(services.ticket!.purge(ticket.id)).rejects.toMatchObject({
      capability: 'ticket:delete',
    });
    expect(await rowsTable(runtime, 'tickets').get(ticket.id)).toMatchObject({
      deletedAt: runtime.clock.now().toISOString(),
    });
  });

  it('permanently purges a trashed row and its cascades', async () => {
    const { runtime, services } = await boot();
    const undoToken = await services.customer!.remove('customer_0002');

    await expect(services.customer!.purge('customer_0002')).resolves.toBe(3);
    expect(await rowsTable(runtime, 'customers').get('customer_0002')).toBeUndefined();
    expect(await rowsTable(runtime, 'tickets').get('ticket_0003')).toBeUndefined();
    await expect(services.customer!.restore(undoToken as string)).rejects.toThrow();
  });
});
