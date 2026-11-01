import {
  type Blueprint,
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blankCanvas, CanvasScreen, type CanvasScreenSpec } from '../src/screens/canvas/index.ts';

const blueprint: Blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Studio boards',
  entities: [
    {
      name: 'board',
      plural: 'boards',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'layout', kind: 'json' },
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
const spec = { type: 'canvas', entity: 'board', field: 'layout' } as CanvasScreenSpec;

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

let sequence = 0;
let harness = createHarness(definition('crud-canvas'));
beforeEach(() => {
  sequence += 1;
  harness = createHarness(definition(`crud-canvas-${sequence}`));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

/** Boots a role whose boards are exactly `boards` (the generator seeds one). */
async function boot(role: string, boards: Record<string, unknown>[]) {
  const owner = await harness.boot('owner');
  const ownerServices = createEntityServices(owner, blueprint);
  for (const row of await ownerServices.board!.list())
    await ownerServices.board!.remove(String(row.id));
  for (const board of boards) await ownerServices.board!.create(board);
  const runtime = role === 'owner' ? owner : await harness.boot(role);
  return { runtime, services: createEntityServices(runtime, blueprint) };
}

describe('CanvasScreen', () => {
  it('opens an empty record blank and saves the first edit into its json field', async () => {
    const { runtime, services } = await boot('owner', [{ title: 'Roadmap' }]);
    render(CanvasScreen, { runtime, blueprint, services, screen: spec });
    expect(await screen.findByRole('heading', { name: 'Boards canvas' })).toBeTruthy();
    const surface = await screen.findByRole('application');
    surface.focus();
    // On the empty surface, Enter creates a shape of the active tool (a sticky note via S).
    await fireEvent.keyDown(surface, { key: 's' });
    await fireEvent.keyDown(surface, { key: 'Enter' });
    await waitFor(async () => {
      const [row] = await services.board!.list();
      const layout = row?.layout as { format?: string; shapes?: unknown[] } | null;
      expect(layout?.format).toBe('texuli-canvas');
      expect(layout?.shapes?.length).toBe(1);
    });
  });

  it('never repairs a stored value that is not a canvas; the owner can start over', async () => {
    const { runtime, services } = await boot('owner', [
      { title: 'Roadmap', layout: { format: 'texuli-canvas', formatVersion: 1, shapes: 'nope' } },
    ]);
    render(CanvasScreen, { runtime, blueprint, services, screen: spec });
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be opened/);
    await fireEvent.click(screen.getByRole('button', { name: 'Start over with a blank canvas' }));
    await waitFor(async () => {
      const [row] = await services.board!.list();
      expect(row?.layout).toEqual(blankCanvas('Roadmap'));
    });
    expect(await screen.findByRole('application')).toBeTruthy();
  });

  it('is read-only for a role that cannot update the entity', async () => {
    // The generator seeds one board; a viewer reads it.
    const runtime = await harness.boot('viewer');
    const services = createEntityServices(runtime, blueprint);
    render(CanvasScreen, { runtime, blueprint, services, screen: spec });
    expect(await screen.findByText(/can read this canvas but not edit it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import JSON' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start over with a blank canvas' })).toBeNull();
  });
});
