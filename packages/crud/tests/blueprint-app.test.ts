import {
  createEntityServices,
  deriveAppModel,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
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

async function boot() {
  const runtime = await harness.boot('owner');
  const themeLibrary = vi.fn(async () => [
    { id: 'fixture-library-theme', name: 'Fixture library theme' },
  ]);
  const view = render(BlueprintAppHarness, { runtime, blueprint, themeLibrary });
  return { runtime, view, themeLibrary };
}

describe('BlueprintApp', () => {
  it('derives its routes from the app model', () => {
    expect(model.routes.map((route) => [route.path, route.view])).toEqual([
      ['/', 'home'],
      ['/customers', 'entity'],
      ['/customers/:id', 'entity'],
      ['/tickets', 'entity'],
      ['/tickets/:id', 'screen'],
      ['/invoices', 'entity'],
      ['/invoices/:id', 'entity'],
      ['/notes', 'entity'],
      ['/notes/:id', 'entity'],
      ['/tickets/board', 'screen'],
      ['/dashboard', 'screen'],
      ['/settings', 'screen'],
      ['/members', 'members'],
    ]);
  });

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

  it('navigates every route of the blueprint', async () => {
    const { runtime, themeLibrary } = await boot();
    await screen.findByRole('heading', { name: blueprint.name });
    const ids: Record<string, string> = {};
    for (const name of ['customers', 'tickets', 'invoices', 'notes']) {
      const rows = await table(runtime, name).toArray();
      ids[name] = String(rows[0]?.id ?? 'missing');
    }
    const expectations: Record<string, () => Promise<unknown>> = {
      '/': () => screen.findByRole('heading', { name: blueprint.name }),
      '/customers': () => screen.findByRole('button', { name: /New/ }),
      '/customers/:id': () => screen.findByRole('button', { name: 'Save' }),
      '/tickets': () => screen.findByRole('button', { name: /New/ }),
      '/tickets/:id': () => screen.findByRole('tab', { name: /Overview/i }),
      '/invoices': () => screen.findByRole('button', { name: /New/ }),
      '/invoices/:id': () => screen.findByRole('button', { name: 'Save' }),
      '/notes': () => screen.findByRole('button', { name: /New/ }),
      '/notes/:id': () => screen.findByRole('button', { name: 'Save' }),
      '/tickets/board': () => screen.findAllByText(/open/i),
      '/dashboard': () => screen.findByRole('heading', { name: 'Ops' }),
      '/settings': async () => {
        await screen.findByTestId('settings-appearance');
        // The settings screen asked the shell for the extra theme choices.
        expect(themeLibrary).toHaveBeenCalledTimes(1);
      },
      '/members': () => screen.findByRole('heading', { name: 'Members' }),
    };
    expect(Object.keys(expectations)).toEqual(model.routes.map((route) => route.path));
    for (const route of model.routes) {
      const table = route.path.split('/')[1] ?? '';
      const path = route.path.replace(':id', ids[table] ?? '');
      await go(path);
      await expectations[route.path]!();
      expect(screen.queryByText(/could not be (shown|loaded)/), route.path).toBeNull();
      expect(screen.queryByText(/not part of the blueprint/), route.path).toBeNull();
    }
  }, 60_000);

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

  it('shows a clear message for a record that does not exist', async () => {
    await boot();
    await go('/customers/does-not-exist');
    expect(await screen.findByText(/no longer exists or your role cannot see it/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /New/ })).toBeTruthy();
  });
});
