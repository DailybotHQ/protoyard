import { createEntityServices, parseBlueprint } from '@protoyard/blueprint';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import CrudHarness from './fixtures/CrudHarness.svelte';

let harness = createHarness(createBlueprintDefinition('crud-fixture'));
beforeEach(() => {
  harness = createHarness(createBlueprintDefinition('crud-fixture'));
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
      expect(document.querySelectorAll('[data-select-trigger]')).toHaveLength(2);
    });
    const assigneeLabel = screen.getByText('Assignee').closest('label');
    const assigneeControl = assigneeLabel ? document.getElementById(assigneeLabel.htmlFor) : null;
    expect(assigneeControl?.hasAttribute('data-select-trigger')).toBe(true);
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
