import {
  createEntityServices,
  deriveAppModel,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { entityRecordRoute } from '../src/app/context.ts';
import BlueprintAppHarness from './fixtures/BlueprintAppHarness.svelte';

/** The help desk fixture plus one screen of each shell-relevant kind. */
const blueprint = parseBlueprint({
  ...helpdeskBlueprint,
  description: 'A fictional support team.',
  screens: [
    { type: 'list', entity: 'customer', title: 'Accounts' },
    { type: 'board', entity: 'ticket', groupBy: 'status', nav: { order: 1 } },
    { type: 'detail', entity: 'ticket', tabs: ['overview'] },
    { type: 'dashboard', title: 'Ops' },
    { type: 'settings' },
  ],
});
const model = deriveAppModel(blueprint);

// Layouts and screen kits load lazily; give them time on a busy machine.
configure({ asyncUtilTimeout: 10_000 });

function createDefinition(namespace: string) {
  const definition = createBlueprintDefinition(namespace);
  return {
    ...definition,
    database: {
      ...definition.database,
      versions: definition.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(blueprint) } : version
      ),
    },
  };
}

let harness = createHarness(createDefinition('crud-app-shell'));
beforeEach(() => {
  harness = createHarness(
    createDefinition(`crud-app-shell-${Math.random().toString(36).slice(2, 8)}`)
  );
  location.hash = '#/';
});
afterEach(() => {
  cleanup();
  harness.closeAll();
  location.hash = '';
});

const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): { toArray(): Promise<Row[]> } }).table(name);

async function go(path: string) {
  location.hash = `#${path}`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function boot(extra: Partial<ComponentProps<typeof BlueprintAppHarness>> = {}) {
  const runtime = await harness.boot('owner');
  const themeLibrary = vi.fn(async () => [
    { id: 'fixture-library-theme', name: 'Fixture library theme' },
  ]);
  const view = render(BlueprintAppHarness, { runtime, blueprint, themeLibrary, ...extra });
  return { runtime, view, themeLibrary };
}

describe('BlueprintApp', () => {
  it('mounts with layout navigation, search and home counts', async () => {
    const { runtime } = await boot();
    expect(await screen.findByRole('heading', { name: blueprint.name })).toBeTruthy();
    expect(screen.getByText('A fictional support team.')).toBeTruthy();
    const customers = await table(runtime, 'customers').toArray();
    await waitFor(() =>
      expect(screen.getByTestId('home-count-customer').textContent).toContain(
        String(customers.length)
      )
    );
    // The layout loads lazily, then renders one link per model nav row.
    await waitFor(() => {
      for (const item of model.nav) {
        expect(
          document.querySelector(`a[href="#${item.path}"]`),
          `nav link ${item.path}`
        ).not.toBeNull();
      }
    });
    expect(screen.getByRole('button', { name: /^Search/ })).toBeTruthy();
    // No entity enables notifications, so there is no bell (its table does not exist).
    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull();
  });

  it('creates and edits records through the entity services', async () => {
    const { runtime } = await boot();
    const services = createEntityServices(runtime, blueprint);
    const before = await services.customer!.list();

    await go('/customers');
    await fireEvent.click(await screen.findByRole('button', { name: /New/ }));
    const form = await screen.findByRole('button', { name: /Create customer/i });
    await fireEvent.input(screen.getByLabelText(/^Name/), {
      target: { value: 'Example Lighthouse Co' },
    });
    await fireEvent.click(form);
    await waitFor(async () => {
      const rows = await services.customer!.list();
      expect(rows).toHaveLength(before.length + 1);
    });
    const created = (await services.customer!.list()).find(
      (row) => row.name === 'Example Lighthouse Co'
    );
    expect(created?.id).toBeTruthy();
    await waitFor(() => expect(location.hash).toBe('#/customers'));

    await go(`/customers/${created!.id}`);
    const save = await screen.findByRole('button', { name: 'Save' });
    const name = screen.getByLabelText(/^Name/) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe('Example Lighthouse Co'));
    await fireEvent.input(name, { target: { value: 'Example Lighthouse Group' } });
    await fireEvent.click(save);
    await waitFor(async () =>
      expect((await services.customer!.get(String(created!.id)))?.name).toBe(
        'Example Lighthouse Group'
      )
    );
  }, 60_000);

  it('rejects an invalid create through zod and keeps the form open', async () => {
    const { runtime } = await boot();
    const services = createEntityServices(runtime, blueprint);
    const before = (await services.customer!.list()).length;
    await go('/customers');
    await fireEvent.click(await screen.findByRole('button', { name: /New/ }));
    await fireEvent.input(screen.getByLabelText(/^Name/), { target: { value: 'A' } });
    await fireEvent.click(await screen.findByRole('button', { name: /Create customer/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create customer/i })).toBeTruthy()
    );
    expect((await services.customer!.list()).length).toBe(before);
  }, 60_000);

  it('encodes record ids in routes, so an id with / ? # opens and saves its record', async () => {
    expect(entityRecordRoute('customers', 'acme/west?x#1')).toBe('/customers/acme%2Fwest%3Fx%231');
    const { runtime } = await boot();
    const services = createEntityServices(runtime, blueprint);
    const [row] = await services.customer!.list();
    const id = 'acme/west?x#1';
    // An imported or hand-made id: the services keep ids as given.
    await (
      runtime.db as unknown as {
        table(name: string): { put(row: Row): Promise<unknown> };
      }
    )
      .table('customers')
      .put({ ...row!, id, name: 'Example Slash Harbor' } as Row);
    await go(entityRecordRoute('customers', id));
    const name = (await screen.findByLabelText(/^Name/)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe('Example Slash Harbor'));
    await fireEvent.input(name, { target: { value: 'Example Slash Group' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect((await services.customer!.get(id))?.name).toBe('Example Slash Group')
    );
  }, 60_000);
});
