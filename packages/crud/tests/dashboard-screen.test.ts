import {
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { Toaster } from '@protoyard/ui';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { DashboardScreen } from '../src/screens/dashboard/index.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Harbor dashboard',
  entities: [
    {
      name: 'request',
      plural: 'requests',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'status', kind: 'enum', values: ['queued', 'done'], required: true },
      ],
      titleField: 'title',
      seedCount: 1,
    },
  ],
  screens: [
    {
      type: 'dashboard',
      title: 'Operations',
      widgets: [
        { kind: 'kpi', label: 'Requests', entity: 'request', aggregate: 'count' },
        { kind: 'chart', label: 'By status', entity: 'request', chart: 'donut', groupBy: 'status' },
      ],
    },
  ],
  roles: [
    { name: 'owner', permissions: { '*': ['*'] } },
    { name: 'viewer', permissions: {} },
  ],
});

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
let harness = createHarness(definition('crud-dashboard'));
beforeEach(() => {
  seq += 1;
  harness = createHarness(definition(`crud-dashboard-${seq}`));
  render(Toaster);
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

function show(runtime: Awaited<ReturnType<typeof harness.boot>>) {
  return render(DashboardScreen, {
    runtime,
    blueprint,
    services: createEntityServices(runtime, blueprint),
    screen: blueprint.screens.find((item) => item.type === 'dashboard') as Extract<
      (typeof blueprint.screens)[number],
      { type: 'dashboard' }
    >,
  });
}

describe('DashboardScreen', () => {
  it('renders aggregates and refreshes after a service mutation', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const seeded = await services.request!.list();
    const latestCreatedAt = seeded
      .map((row) => String(row.createdAt))
      .sort()
      .at(-1);
    if (latestCreatedAt) runtime.clock.setTime(new Date(Date.parse(latestCreatedAt) + 1_000));
    show(runtime);

    expect((await screen.findAllByText('1')).length).toBeGreaterThan(0);
    const created = await services.request!.create({
      title: 'Harbor inspection',
      status: 'queued',
    });
    runtime.clock.setTime(new Date(Date.parse(String(created.createdAt)) + 1_000));
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    expect(
      await screen.findByRole('button', { name: 'View as table' }, { timeout: 10_000 })
    ).toBeTruthy();
  });

  it('shows a per-widget permission state for a blocked persona', async () => {
    const runtime = await harness.boot('viewer');
    show(runtime);

    expect((await screen.findAllByText(/do not have permission to view/)).length).toBe(2);
  });
});
