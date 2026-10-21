import {
  createEntityServices,
  deriveAppModel,
  derivePolicy,
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
import CustomHome from './fixtures/CustomHome.svelte';
import CustomScreen from './fixtures/CustomScreen.svelte';

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

  it('follows navigation from one record to another on a screen route (detail with tabs)', async () => {
    const { runtime } = await boot();
    await screen.findByRole('heading', { name: blueprint.name });
    const [first, second] = (await table(runtime, 'tickets').toArray()).map((row) =>
      String(row.id)
    );
    expect(first && second).toBeTruthy();
    const shown = () =>
      document.querySelector('[data-entity-detail="ticket"]')?.getAttribute('data-record-id');
    await go(`/tickets/${encodeURIComponent(first!)}`);
    await waitFor(() => expect(shown()).toBe(first));
    // Same route pattern, another id: the screen must show the new record.
    await go(`/tickets/${encodeURIComponent(second!)}`);
    await waitFor(() => expect(shown()).toBe(second));
    await go(`/tickets/${encodeURIComponent(first!)}`);
    await waitFor(() => expect(shown()).toBe(first));
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

  it('shows a clear message for a record that does not exist', async () => {
    await boot();
    await go('/customers/does-not-exist');
    expect(await screen.findByText(/no longer exists or your role cannot see it/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /New/ })).toBeTruthy();
  });
});

describe('BlueprintApp home counts', () => {
  it('recounts after a persona switch, showing — for an entity the new role cannot read', async () => {
    // A viewer that cannot read invoices: the counts depend on the active role.
    const restricted = parseBlueprint({
      ...blueprint,
      roles: blueprint.roles.map((role) =>
        role.name === 'viewer'
          ? {
              name: 'viewer',
              permissions: { customer: ['read'], ticket: ['read'], note: ['read'] },
            }
          : role
      ),
    });
    harness = createHarness({
      ...createDefinition(`crud-app-counts-${Math.random().toString(36).slice(2, 8)}`),
      policy: derivePolicy(restricted),
    });
    const runtime = await harness.boot('owner');
    render(BlueprintAppHarness, { runtime, blueprint: restricted });
    const invoices = await table(runtime, 'invoices').toArray();
    expect(invoices.length).toBeGreaterThan(0);
    const invoiceCount = () => screen.getByTestId('home-count-invoice').textContent ?? '';
    await waitFor(() => expect(invoiceCount()).toContain(String(invoices.length)));

    const memberships = (await table(runtime, 'py_memberships').toArray()) as unknown as {
      personaId: string;
      role: string;
    }[];
    const viewer = memberships.find((m) => m.role === 'viewer');
    expect(viewer, 'the owner scenario has a viewer').toBeTruthy();
    await runtime.session.switchActor(viewer!.personaId);
    await waitFor(() => expect(invoiceCount()).toContain('—'));
  }, 60_000);
});

describe('BlueprintApp extension points', () => {
  it('opens a search result on its record route by default', async () => {
    const { runtime } = await boot();
    const services = createEntityServices(runtime, blueprint);
    const row = await services.customer!.create({ name: 'Example Searchable Harbor' });
    await screen.findByRole('heading', { name: blueprint.name });
    await fireEvent.click(screen.getByRole('button', { name: /^Search/ }));
    const input = await screen.findByRole('combobox', { name: 'Search commands' });
    await fireEvent.input(input, { target: { value: 'Searchable Harbor' } });
    await fireEvent.click(await screen.findByRole('option', { name: /Example Searchable Harbor/ }));
    await waitFor(() =>
      expect(location.hash).toBe(`#/customers/${encodeURIComponent(String(row.id))}`)
    );
    // The record's edit form opens there.
    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy();
  }, 60_000);

  it('renders a custom home, extra routes and custom header actions', async () => {
    const { runtime } = await boot({
      home: CustomHome,
      extraRoutes: [
        { path: '/tickets/:id/workspace', title: 'Workspace', component: CustomScreen },
      ],
      customActions: true,
    });
    expect(await screen.findByRole('heading', { name: 'Custom home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Custom action' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Search/ })).toBeNull();
    await go('/tickets/t-1/workspace');
    expect(await screen.findByRole('heading', { name: 'Custom screen' })).toBeTruthy();
    expect(screen.getByTestId('custom-params').textContent).toContain('"id":"t-1"');
    // Blueprint routes still work next to the extra ones.
    const [ticket] = await table(runtime, 'tickets').toArray();
    await go(`/tickets/${encodeURIComponent(String(ticket?.id))}`);
    expect(await screen.findByRole('tab', { name: /Overview/i })).toBeTruthy();
  }, 60_000);

  it('sends list rows and search results to recordHref when it returns a path', async () => {
    const recordHref = vi.fn((entityName: string, id: string) =>
      entityName === 'customer' ? `/customers/${encodeURIComponent(id)}/workspace` : undefined
    );
    const { runtime } = await boot({
      recordHref,
      extraRoutes: [{ path: '/customers/:id/workspace', component: CustomScreen }],
    });
    const services = createEntityServices(runtime, blueprint);
    const row = await services.customer!.create({ name: 'Example Row Opener' });
    await go('/customers');
    await fireEvent.click(await screen.findByRole('row', { name: /Example Row Opener/ }));
    await waitFor(() =>
      expect(location.hash).toBe(`#/customers/${encodeURIComponent(String(row.id))}/workspace`)
    );
    expect(await screen.findByRole('heading', { name: 'Custom screen' })).toBeTruthy();
    expect(recordHref).toHaveBeenCalledWith('customer', String(row.id));
  }, 60_000);
});
