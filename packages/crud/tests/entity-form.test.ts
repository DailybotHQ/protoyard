import { createEntityServices } from '@protoyard/blueprint';
import { ValidationError } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import EntityForm from '../src/EntityForm.svelte';
import CrudHarness from './fixtures/CrudHarness.svelte';

let harness = createHarness(createBlueprintDefinition('crud-entity-form'));
beforeEach(() => {
  harness = createHarness(createBlueprintDefinition('crud-entity-form'));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

async function boot() {
  const runtime = await harness.boot('owner');
  return { runtime, services: createEntityServices(runtime, helpdeskBlueprint) };
}

const entity = (name: string) => helpdeskBlueprint.entities.find((e) => e.name === name)!;

describe('EntityForm on @texuli/forms', () => {
  it('paints every field in one SchemaForm, hosted ones as custom fields with Protoyard controls', async () => {
    const { runtime, services } = await boot();
    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'form-create',
      entityName: 'ticket',
    });
    const form = document.querySelector('[data-entity-form="ticket"]') as HTMLElement;
    const schema = form.querySelector('form.tx-forms') as HTMLFormElement;
    expect(schema).toBeTruthy();
    expect(within(schema).getByRole('heading', { name: 'New ticket', level: 2 })).toBeTruthy();
    for (const name of ['subject', 'status', 'assigneeId', 'labels']) {
      expect(schema.querySelector(`[data-tx-forms-field="${name}"]`), name).toBeTruthy();
    }
    // The relation picker is a Texuli custom field (G113) inside the same form.
    const hosted = schema.querySelector('[data-entity-form-hosted="customer"]') as HTMLElement;
    expect(hosted.querySelector('[data-relation-picker="customer"]')).toBeTruthy();
    // Texuli paints its label; the picker's control carries the field id.
    const customField = schema.querySelector('[data-tx-forms-field="customerId"]') as HTMLElement;
    expect(customField.contains(hosted)).toBe(true);
    expect(within(customField).getByText(/^Customer/)).toBeTruthy();
    // The action row is Protoyard's Button inside the form (G115), no hidden Texuli row.
    const submit = within(schema).getByRole('button', { name: 'Create ticket' });
    expect(submit.getAttribute('type')).toBe('submit');
    expect(within(form).getAllByRole('button', { name: 'Create ticket' })).toHaveLength(1);
  });

  it('reports a service issue on a hosted field inline and writes nothing', async () => {
    const { runtime, services } = await boot();
    const before = (await services.ticket!.list()).length;
    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'form-create',
      entityName: 'ticket',
    });
    await fireEvent.input(screen.getByRole('textbox', { name: /^Subject/ }), {
      target: { value: 'Printer queue stuck' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    // Texuli validates the hosted (custom) field with the rest and marks it inline.
    const field = document.querySelector('[data-tx-forms-field="customerId"]') as HTMLElement;
    await waitFor(() => expect(within(field).getByText(/Customer is required/)).toBeTruthy());
    expect(screen.queryByTestId('created-id')).toBeNull();
    expect((await services.ticket!.list()).length).toBe(before);
  });

  it('edits money in major units and stores integer cents through the service', async () => {
    const { runtime, services } = await boot();
    const invoice = await services.invoice!.create({ number: 'INV-7', amount: 12_345 });
    render(CrudHarness, {
      runtime,
      blueprint: helpdeskBlueprint,
      services,
      mode: 'form-edit',
      entityName: 'invoice',
      initial: invoice,
    });
    const amount = screen.getByRole('spinbutton', { name: /^Amount/ }) as HTMLInputElement;
    expect(amount.value).toBe('123.45');
    expect(screen.getByRole('heading', { name: 'Edit invoice' })).toBeTruthy();
    await fireEvent.input(amount, { target: { value: '99.5' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('edited-id').textContent).toBe(invoice.id));
    expect((await services.invoice!.get(String(invoice.id)))?.amount).toBe(9950);
  });

  it('puts service issues on Texuli fields inline and shows pending feedback while saving', async () => {
    const { runtime } = await boot();
    let release!: () => void;
    const calls: Record<string, unknown>[] = [];
    render(EntityForm, {
      entity: entity('customer'),
      runtime,
      onSubmit: async (input: Record<string, unknown>) => {
        calls.push(input);
        await new Promise<void>((resolve) => (release = resolve));
        throw new ValidationError({ name: 'That name is taken' });
      },
    });
    await fireEvent.input(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Northwind' },
    });
    const submit = screen.getByRole('button', { name: 'Create customer' });
    await fireEvent.click(submit);
    await waitFor(() => expect(submit.getAttribute('aria-busy')).toBe('true'));
    release();
    await waitFor(() =>
      expect(screen.getAllByText('That name is taken').length).toBeGreaterThan(0)
    );
    expect(submit.getAttribute('aria-busy')).toBeNull();
    // The persona is a Texuli select over the members, unassigned by default.
    expect(calls).toEqual([{ name: 'Northwind', email: '', accountManagerId: null }]);
  });

  it('shows a service issue that matches no form field as the form message', async () => {
    const { runtime } = await boot();
    render(EntityForm, {
      entity: entity('customer'),
      runtime,
      onSubmit: async () => {
        throw new ValidationError({ _record: 'This customer already exists in another workspace' });
      },
    });
    await fireEvent.input(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Northwind' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));
    await waitFor(() =>
      expect(
        screen.getAllByText('This customer already exists in another workspace').length
      ).toBeGreaterThan(0)
    );
  });
});
