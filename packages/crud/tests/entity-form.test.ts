import { createEntityServices } from '@protoyard/blueprint';
import { type Row, ValidationError } from '@protoyard/core';
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
  it('paints mapped fields with SchemaForm and hosted ones with Protoyard controls', async () => {
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
    // The relation picker is hosted after the Texuli fields, outside its form.
    const hosted = form.querySelector('[data-entity-form-hosted]') as HTMLElement;
    expect(hosted.querySelector('[data-relation-picker="customer"]')).toBeTruthy();
    expect(schema.contains(hosted)).toBe(false);
    // One visible submit drives both, bound to the Texuli form.
    const submit = within(form).getByRole('button', { name: 'Create ticket' });
    expect(submit.getAttribute('form')).toBe(schema.id);
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
    const hosted = document.querySelector('[data-entity-form-hosted]') as HTMLElement;
    await waitFor(() => expect(within(hosted).getByText(/Customer is required/)).toBeTruthy());
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

  it('paints a disabled form with disabled Texuli controls and no active submit', async () => {
    const { runtime } = await boot();
    render(EntityForm, {
      entity: entity('customer'),
      runtime,
      disabled: true,
      onSubmit: async () => {
        throw new Error('A disabled form never submits');
      },
    });
    expect((screen.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole('button', { name: 'Create customer' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('falls back to Protoyard controls when no field maps to Texuli', async () => {
    const { runtime } = await boot();
    const sent: Row[] = [];
    render(EntityForm, {
      entity: {
        ...entity('customer'),
        fields: [{ name: 'avatar', kind: 'avatar', required: false, sensitive: false }],
      },
      runtime,
      onSubmit: async (input: Record<string, unknown>) => {
        sent.push(input as Row);
        return input;
      },
    });
    expect(document.querySelector('form.tx-forms')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));
    await waitFor(() => expect(sent).toEqual([{ avatar: null }]));
  });
});
