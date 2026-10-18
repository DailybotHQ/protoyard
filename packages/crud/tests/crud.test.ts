import { createEntityServices } from '@protoyard/blueprint';
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
});
