import {
  createEntityServices,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import CrudHarness from './fixtures/CrudHarness.svelte';

const crudBlueprint = structuredClone(helpdeskBlueprint);
crudBlueprint.entities.find((entity) => entity.name === 'customer')!.features = {
  softDelete: true,
  audit: false,
  notifications: false,
  files: false,
  csv: true,
};
crudBlueprint.entities.find((entity) => entity.name === 'ticket')!.features.softDelete = true;
function createCrudDefinition() {
  const definition = createBlueprintDefinition('crud-fixture');
  return {
    ...definition,
    database: {
      ...definition.database,
      versions: definition.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(crudBlueprint) } : version
      ),
    },
  };
}

let harness = createHarness(createCrudDefinition());
beforeEach(() => {
  harness = createHarness(createCrudDefinition());
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

describe('EntityList', () => {
  it('lists customers and exposes New when the owner can create', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    await services.customer!.create({ name: 'Acme Example' });

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'list',
      entityName: 'customer',
    });

    await waitFor(() => expect(screen.getByText('Acme Example')).toBeTruthy());
    expect(screen.getByRole('button', { name: /New/i })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /New/i }));
    expect(screen.getByTestId('created-id').textContent).toBe('intent-create');
  });

  it('hides New for viewers', async () => {
    const runtime = await harness.boot('viewer');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'list',
      entityName: 'customer',
    });
    await waitFor(() =>
      expect(
        screen.getByRole('table', { name: /customers/i }) || screen.getByText(/No customers/i)
      ).toBeTruthy()
    );
    expect(screen.queryByRole('button', { name: /New/i })).toBeNull();
  });

  it('shows related record titles and persona names instead of ids', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const customer = await services.customer!.create({ name: 'Northstar Studio' });
    const persona = runtime.members.list()[0]!.persona;
    const ticket = await services.ticket!.create({
      subject: 'Workspace access',
      customerId: customer.id,
      assigneeId: persona.id,
    });

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'list',
      entityName: 'ticket',
    });

    expect(await screen.findByText(String(ticket.subject))).toBeTruthy();
    expect(screen.getByText('Northstar Studio')).toBeTruthy();
    expect(screen.getByText(persona.name)).toBeTruthy();
    expect(screen.queryByText(customer.id)).toBeNull();
    expect(screen.queryByText(persona.id)).toBeNull();
    expect(screen.getByRole('table', { name: 'Tickets' })).toBeTruthy();
  });

  it('soft-deletes selected rows to Trash and can undo the batch', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, crudBlueprint);
    const first = await services.customer!.create({ name: 'Bulk soft one' });
    const second = await services.customer!.create({ name: 'Bulk soft two' });

    render(CrudHarness, {
      runtime,
      blueprint: crudBlueprint,
      services,
      mode: 'list',
      entityName: 'customer',
    });

    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select row Open Bulk soft one' })
    );
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Open Bulk soft two' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(async () =>
      expect(new Set((await services.customer!.trash()).map((row) => row.id))).toEqual(
        new Set([first.id, second.id])
      )
    );
    await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => {
      expect(await services.customer!.get(first.id)).toBeTruthy();
      expect(await services.customer!.get(second.id)).toBeTruthy();
    });
  });

  it('keeps the delete dialog open with a busy confirm button until the service settles', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, crudBlueprint);
    const row = await services.customer!.create({ name: 'Slow delete' });
    const remove = services.customer!.remove;
    let release!: () => void;
    services.customer!.remove = (id) =>
      new Promise<void>((r) => (release = r)).then(() => remove(id));

    render(CrudHarness, {
      runtime,
      blueprint: crudBlueprint,
      services,
      mode: 'list',
      entityName: 'customer',
    });
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select row Open Slow delete' })
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(dialog.querySelector('button[aria-busy="true"]')?.textContent).toContain('Delete')
    );
    release();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((await services.customer!.trash()).map((r) => r.id)).toContain(row.id);
  });

  it('restores selected trash rows through the entity service', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, crudBlueprint);
    const customer = await services.customer!.create({ name: 'Restore from trash' });
    await services.customer!.remove(customer.id);

    render(CrudHarness, {
      runtime,
      blueprint: crudBlueprint,
      services,
      mode: 'list',
      entityName: 'customer',
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select row Open Restore from trash' })
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Restore 1' }));

    await waitFor(async () => expect(await services.customer!.get(customer.id)).toBeTruthy());
    expect(screen.getAllByText('Restored 1 record').length).toBeGreaterThan(0);
  });

  it('shows loading on the Restore button while the restore runs', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, crudBlueprint);
    const customer = await services.customer!.create({ name: 'Slow restore' });
    await services.customer!.remove(customer.id);
    const restoreTrashed = services.customer!.restoreTrashed;
    let release!: () => void;
    services.customer!.restoreTrashed = (id) =>
      new Promise<void>((r) => (release = r)).then(() => restoreTrashed(id));

    render(CrudHarness, {
      runtime,
      blueprint: crudBlueprint,
      services,
      mode: 'list',
      entityName: 'customer',
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select row Open Slow restore' })
    );
    const restore = screen.getByRole('button', { name: 'Restore 1' }) as HTMLButtonElement;
    await fireEvent.click(restore);
    expect(restore.getAttribute('aria-busy')).toBe('true');
    expect(restore.disabled).toBe(true);
    release();
    await waitFor(async () => expect(await services.customer!.get(customer.id)).toBeTruthy());
  });

  it('re-reads the list after a persona switch, in both directions', async () => {
    // A viewer that may read tickets but not customers.
    const restricted = structuredClone(helpdeskBlueprint);
    restricted.roles = restricted.roles.map((role) =>
      role.name === 'viewer' ? { ...role, permissions: { ticket: ['read'] } } : role
    );
    harness.closeAll();
    harness = createHarness({ ...createCrudDefinition(), policy: derivePolicy(restricted) });
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, restricted);
    await services.customer!.create({ name: 'Acme Example' });
    const ownerId = runtime.session.principal()!.persona.id;
    const viewerId = runtime.members.list().find((m) => m.membership.role === 'viewer')!.persona.id;

    // Mounted while the viewer cannot read customers: list() is refused.
    await runtime.session.switchActor(viewerId);
    render(CrudHarness, {
      runtime,
      blueprint: restricted,
      services,
      mode: 'list',
      entityName: 'customer',
    });
    expect(await screen.findByText('You do not have access to this list.')).toBeTruthy();
    // Let the refused query settle as the viewer before switching back.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The owner sees the rows without a reload.
    await runtime.session.switchActor(ownerId);
    expect(await screen.findByText('Acme Example')).toBeTruthy();

    await runtime.session.switchActor(viewerId);
    await waitFor(() =>
      expect(screen.getByText('You do not have access to this list.')).toBeTruthy()
    );
    expect(screen.queryByText('Acme Example')).toBeNull();

    // Back to the owner: the rows come back without a reload.
    await runtime.session.switchActor(ownerId);
    expect(await screen.findByText('Acme Example')).toBeTruthy();
  });

  it('passes each row to :own delete checks and only deletes records owned by the agent', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, crudBlueprint);
    const memberships = runtime.members.list();
    const memberId = memberships.find(
      (membership) => membership.persona.id !== runtime.session.principal()?.persona.id
    )!.persona.id;
    const notOwned = await services.ticket!.create({
      subject: 'Not assigned to member',
      customerId: 'customer_0001',
    });
    const owned = await services.ticket!.create({
      subject: 'Assigned to member',
      customerId: 'customer_0001',
      assigneeId: memberId,
    });
    await runtime.session.switchActor(memberId);

    render(CrudHarness, {
      runtime,
      blueprint: crudBlueprint,
      services,
      mode: 'list',
      entityName: 'ticket',
    });

    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select row Open Assigned to member' })
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(async () => expect(await services.ticket!.get(owned.id)).toBeUndefined());
    expect(await services.ticket!.get(notOwned.id)).toBeTruthy();
    expect((await services.ticket!.trash()).map((row) => row.id)).toContain(owned.id);
  });

  it('delegates CSV uploads to the atomic import service operation', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, crudBlueprint);
    render(CrudHarness, {
      runtime,
      blueprint: crudBlueprint,
      services,
      mode: 'list',
      entityName: 'customer',
    });
    const before = (await services.customer!.list()).length;
    const csv = 'Name\nAtomic valid\nSecond valid\n';
    const importCsv = vi.spyOn(services.customer!, 'importCsv');
    const file = new File([csv], 'customers.csv', {
      type: 'text/csv',
    });
    await fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [file] },
    });

    await waitFor(() => expect(importCsv).toHaveBeenCalledWith(csv, { mode: 'commit' }));
    await waitFor(async () => expect((await services.customer!.list()).length).toBe(before + 2));
  });
});

describe('EntityForm', () => {
  it('creates a customer and shows inline validation errors', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'form-create',
      entityName: 'customer',
    });

    await fireEvent.click(screen.getByRole('button', { name: /Create customer/i }));
    await waitFor(() => expect(screen.getByText(/at least 2 characters|required/i)).toBeTruthy());

    const nameInput = screen.getByRole('textbox', { name: /name/i });
    await fireEvent.input(nameInput, { target: { value: 'Northwind Co' } });
    await fireEvent.click(screen.getByRole('button', { name: /Create customer/i }));
    await waitFor(() => expect(screen.getByTestId('created-id').textContent).toMatch(/^customer_/));

    const stored = await services.customer!.get(screen.getByTestId('created-id').textContent!);
    expect(stored?.name).toBe('Northwind Co');
  });

  it('uses relation pickers for relation and persona fields in entity forms', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const customer = await services.customer!.create({ name: 'Form relation customer' });
    const ticket = await services.ticket!.create({
      subject: 'Form relation ticket',
      customerId: customer.id,
    });

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'form-edit',
      entityName: 'ticket',
      initial: ticket,
    });

    await waitFor(() => {
      expect(document.querySelector('[data-relation-picker="customer"]')).toBeTruthy();
      expect(document.querySelectorAll('button[role="combobox"]')).toHaveLength(2);
    });
    const assigneeLabel = screen.getByText('Assignee').closest('label');
    const assigneeControl = assigneeLabel ? document.getElementById(assigneeLabel.htmlFor) : null;
    expect(assigneeControl?.matches('button[role="combobox"]')).toBe(true);
    expect(document.querySelector('[data-relation-picker="assignee"]')).toBeNull();
    expect(document.querySelector('input[placeholder="id"]')).toBeNull();
  });
});

describe('EntityDetail and RelationPicker', () => {
  it('shows the record and indexed one-to-many related records with hash links', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const customer = await services.customer!.create({ name: 'Northwind Detail' });
    const ticket = await services.ticket!.create({
      subject: 'Detail relation',
      customerId: customer.id,
    });

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'detail',
      entityName: 'customer',
      initial: customer,
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Northwind Detail', level: 2 })).toBeTruthy()
    );
    const link = await screen.findByRole('link', { name: 'Detail relation' });
    expect(link.getAttribute('href')).toBe(`#/tickets/${encodeURIComponent(String(ticket.id))}`);
  });

  it('allows the detail heading level to be configured', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const customer = await services.customer!.create({ name: 'Level three detail' });

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'detail',
      entityName: 'customer',
      initial: customer,
      detailHeadingLevel: 3,
    });

    expect(
      await screen.findByRole('heading', { name: 'Level three detail', level: 3 })
    ).toBeTruthy();
  });

  it('persists the selected relation through the entity service', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const customer = await services.customer!.create({ name: 'Picker customer' });
    const ticket = await services.ticket!.create({
      subject: 'Picker target',
      customerId: customer.id,
    });
    const note = await services.note!.create({ body: 'Relation is editable' });

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'relation-picker',
      entityName: 'note',
      initial: note,
    });

    await waitFor(() =>
      expect(
        document.querySelector('[data-relation-picker]')?.getAttribute('data-option-count')
      ).not.toBe('0')
    );
    const input = await screen.findByRole('combobox');
    expect(input).toBeTruthy();
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await fireEvent.click(screen.getByTestId('save-relation'));
    await waitFor(async () =>
      expect((await services.note!.get(String(note.id)))?.ticketId).toBe(ticket.id)
    );
  });

  it('paginates relation options after the first 200 indexed rows', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const customers = Array.from({ length: 201 }, (_, index) => ({
      id: `customer_page_${String(index).padStart(3, '0')}`,
      name: `Paged customer ${String(index).padStart(3, '0')}`,
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-01T09:00:00.000Z',
    }));
    await (
      runtime.db as { table(name: string): { bulkPut(rows: typeof customers): Promise<unknown> } }
    )
      .table('customers')
      .bulkPut(customers);

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'relation-picker',
      entityName: 'ticket',
    });

    const picker = document.querySelector('[data-relation-picker]');
    await waitFor(() => expect(picker?.getAttribute('data-option-count')).toBe('200'));
    await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(picker?.getAttribute('data-option-count')).toBe('204'));
  });

  it('shows an explicit not-found state for a deleted record id', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const customer = await services.customer!.create({ name: 'Removed detail' });
    await services.customer!.remove(String(customer.id));

    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'detail',
      entityName: 'customer',
      initial: customer,
    });

    await waitFor(() => expect(screen.getByText('Record not found')).toBeTruthy());
  });

  it('lists per-record audit history after an entity change', async () => {
    const auditedBlueprint = parseBlueprint({
      ...helpdeskBlueprint,
      entities: helpdeskBlueprint.entities.map((entity) =>
        entity.name === 'note'
          ? { ...entity, features: { ...entity.features, audit: true } }
          : entity
      ),
    });
    const base = createBlueprintDefinition('crud-audit-fixture');
    const definition = {
      ...base,
      database: {
        ...base.database,
        versions: base.database.versions.map((version, index) =>
          index === 0
            ? {
                ...version,
                stores: {
                  ...version.stores,
                  auditEntries: 'id, entity, recordId, actorId, action, at',
                },
              }
            : version
        ),
      },
    };
    harness = createHarness(definition);
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, auditedBlueprint);
    const note = await services.note!.create({ body: 'Before history' });
    const updated = await services.note!.update(String(note.id), { body: 'After history' });

    render(CrudHarness, {
      runtime,
      blueprint: auditedBlueprint,
      services,
      mode: 'detail',
      entityName: 'note',
      initial: updated,
    });

    expect(await screen.findByRole('region', { name: 'Change history' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Before history → After history/)).toBeTruthy());
  });
});
