import {
  createEntityServices,
  createFileServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { visibleDetailTabs } from '../src/screens/detail-tabs/model.ts';
import CrudHarness from './fixtures/CrudHarness.svelte';

const detailBlueprint = parseBlueprint({
  ...structuredClone(helpdeskBlueprint),
  entities: helpdeskBlueprint.entities.map((entity) =>
    entity.name === 'ticket'
      ? {
          ...entity,
          fields: [...entity.fields, { name: 'attachment', kind: 'file', accept: ['text/plain'] }],
          features: { ...entity.features, audit: true, files: true },
        }
      : entity
  ),
  screens: [
    {
      type: 'detail',
      entity: 'ticket',
      tabs: ['overview', 'related:note', 'activity', 'files', 'audit'],
    },
  ],
});

function definition(namespace: string) {
  const base = createBlueprintDefinition(namespace);
  return {
    ...base,
    database: { versions: [{ version: 1, stores: deriveStores(detailBlueprint) }] },
    policy: derivePolicy(detailBlueprint),
    integrity: deriveIntegrity(detailBlueprint),
    async generate(ctx: Parameters<typeof base.generate>[0]) {
      const generated = await base.generate(ctx);
      return {
        ...generated,
        tables: {
          ...generated.tables,
          files: [],
          tickets: (generated.tables.tickets ?? []).map((row) => ({ ...row, attachmentId: null })),
        },
      };
    },
  };
}

let seq = 0;
let harness = createHarness(definition('crud-detail-tabs'));
beforeEach(() => {
  seq += 1;
  harness = createHarness(definition(`crud-detail-tabs-${seq}`));
  history.replaceState(null, '', '/#');
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

describe('EntityDetail tabs', () => {
  it('renders real related, activity, file and audit data and creates a child with its parent', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, detailBlueprint);
    const customer = (await services.customer!.list())[0];
    if (!customer) throw new Error('test scenario needs a customer');
    const ticket = await services.ticket!.create({
      subject: 'Detail tabs parent',
      status: 'open',
      customerId: customer.id,
    });
    await services.ticket!.update(String(ticket.id), { subject: 'Updated parent' });
    const linkedNote = await services.note!.create({ body: 'Linked note', ticketId: ticket.id });
    const otherTicket = await services.ticket!.create({
      subject: 'Another parent',
      status: 'open',
      customerId: customer.id,
    });
    await services.note!.create({ body: 'Other note', ticketId: otherTicket.id });
    const file = new Blob(['attachment'], { type: 'text/plain' }) as Blob & { name: string };
    file.name = 'requirements.txt';
    await createFileServices(runtime, detailBlueprint).ticket!.upload({
      entity: 'ticket',
      recordId: String(ticket.id),
      field: 'attachment',
      file,
    });

    render(CrudHarness, {
      runtime,
      blueprint: detailBlueprint,
      services,
      mode: 'detail',
      entityName: 'ticket',
      initial: ticket,
    });

    expect((await screen.findAllByText('Updated parent')).length).toBe(2);
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('data-state')).toBe('active');
    await fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(await screen.findByText('Linked note', {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.queryByText('Other note')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'New' }));
    await fireEvent.input(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: 'Created in context' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Create note' }));
    await waitFor(async () => {
      const created = (await services.note!.list()).find(
        (row) => row.body === 'Created in context'
      );
      expect(created?.ticketId).toBe(ticket.id);
    });

    await fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText(/updated this record/i)).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    expect(await screen.findByText('requirements.txt')).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Change history' }));
    expect(await screen.findByRole('list', { name: 'Change history' })).toBeTruthy();
    expect(String(linkedNote.id)).not.toBe('');
    expect(location.hash).toContain('tab=audit');
  });

  it('hides audit and files tabs when those features are disabled', () => {
    const entity = {
      ...detailBlueprint.entities.find((candidate) => candidate.name === 'ticket')!,
      features: { audit: false, files: false, csv: false, notifications: false, softDelete: false },
    };
    expect(
      visibleDetailTabs(['overview', 'activity', 'files', 'audit', 'related:note'], entity)
    ).toEqual(['overview', 'related:note']);
  });
});
