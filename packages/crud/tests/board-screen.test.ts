import {
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { Toaster } from '@protoyard/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { BoardScreen, type BoardScreenSpec } from '../src/screens/board/index.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Harbor requests',
  entities: [
    {
      name: 'request',
      plural: 'requests',
      fields: [
        { name: 'title', kind: 'text', required: true },
        {
          name: 'status',
          kind: 'enum',
          values: ['queued', 'active', 'done'],
          labels: { queued: 'Queued', active: 'In progress', done: 'Complete' },
          required: true,
        },
        { name: 'amount', kind: 'money', currency: 'USD', required: true },
      ],
      titleField: 'title',
      seedCount: 1,
    },
  ],
  roles: [
    { name: 'owner', permissions: { '*': ['*'] } },
    { name: 'viewer', permissions: { '*': ['read'] } },
  ],
});
const boardScreen: BoardScreenSpec = {
  type: 'board',
  entity: 'request',
  groupBy: 'status',
  cardFields: ['title', 'amount'],
  sumField: 'amount',
};

function definition(namespace: string) {
  const base = createBlueprintDefinition(namespace);
  const generator = createBlueprintGenerator(blueprint);
  return {
    ...base,
    database: { versions: [{ version: 1, stores: deriveStores(blueprint) }] },
    policy: derivePolicy(blueprint),
    integrity: deriveIntegrity(blueprint),
    generate: generator.generate,
  };
}

let seq = 0;
let harness = createHarness(definition('crud-board'));
beforeEach(() => {
  seq += 1;
  harness = createHarness(definition(`crud-board-${seq}`));
  render(Toaster);
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

function show(
  runtime: Awaited<ReturnType<typeof harness.boot>>,
  services = createEntityServices(runtime, blueprint)
) {
  return render(BoardScreen, {
    runtime,
    blueprint,
    services,
    screen: boardScreen,
    onOpenRecord: () => {},
  });
}

const cell = (status: string) =>
  document.querySelector(`[data-board-cell][data-column="${status}"]`);

async function moveToActive(title: string) {
  await fireEvent.click(await screen.findByRole('button', { name: `Move ${title} to…` }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: /In progress/ }));
}

describe('BoardScreen', () => {
  it('persists a menu move across reload and offers Undo', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const created = await services.request!.create({
      title: 'Pilot route',
      status: 'queued',
      amount: 12_500,
    });
    show(runtime, services);

    expect(await screen.findByText(/Queued · \$[\d,.]+/)).toBeTruthy();
    expect(screen.getByText(/Complete · \$[\d,.]+/)).toBeTruthy();
    expect(await screen.findByText('Pilot route')).toBeTruthy();
    await moveToActive('Pilot route');
    await waitFor(
      async () =>
        expect(await services.request!.get(String(created.id))).toMatchObject({ status: 'active' }),
      { timeout: 5000 }
    );
    await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(
      async () =>
        expect(await services.request!.get(String(created.id))).toMatchObject({ status: 'queued' }),
      { timeout: 5000 }
    );
    await moveToActive('Pilot route');
    await waitFor(
      async () =>
        expect(await services.request!.get(String(created.id))).toMatchObject({ status: 'active' }),
      { timeout: 5000 }
    );

    cleanup();
    const reloadedRuntime = await harness.reload(runtime);
    const reloadedServices = createEntityServices(reloadedRuntime, blueprint);
    show(reloadedRuntime, reloadedServices);
    await waitFor(() => expect(cell('active')?.textContent).toContain('Pilot route'));
  });

  it('renders a viewer board without card controls or move menus', async () => {
    const runtime = await harness.boot('viewer');
    const services = createEntityServices(runtime, blueprint);
    show(runtime, services);

    await waitFor(() => expect(document.querySelector('[data-board-card]')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Move .* to/ })).toBeNull();
    expect(document.querySelector('[data-card-control]')).toBeNull();
  });

  it('keeps the card in place and shows an error when the environment is offline', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const created = await services.request!.create({
      title: 'Offline route',
      status: 'queued',
      amount: 0,
    });
    show(runtime, services);
    runtime.environment.set({ network: 'offline' });

    await moveToActive('Offline route');
    await waitFor(() =>
      expect(document.querySelector('[data-kind="error"]')?.textContent).toMatch(/offline|failed/i)
    );
    expect(await services.request!.get(String(created.id))).toMatchObject({ status: 'queued' });
    expect(cell('queued')?.textContent).toContain('Offline route');
    expect(cell('active')?.textContent).not.toContain('Offline route');
  });
});
