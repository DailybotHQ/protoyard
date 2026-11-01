import { createEntityServices, deriveStores } from '@protoyard/blueprint';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
