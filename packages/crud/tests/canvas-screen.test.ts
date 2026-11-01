import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type Blueprint,
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  entityTable,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext } from '@protoyard/scenarios';
import { validateCanvas } from '@protoyard/views-ui/canvas';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  blankCanvas,
  CanvasScreen,
  type CanvasScreenSpec,
  canvasRecordOptions,
  storedCanvas,
} from '../src/screens/canvas/index.ts';

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
const entity = blueprint.entities[0]!;
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

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

describe('canvas screen model', () => {
  it('offers records by title and opens an empty field as a blank canvas', () => {
    expect(
      canvasRecordOptions(
        [
          { id: 'b1', title: 'Roadmap' },
          { id: 'b2', title: '' },
        ],
        entity
      )
    ).toEqual([
      { value: 'b1', label: 'Roadmap' },
      { value: 'b2', label: 'Untitled' },
    ]);
    expect(storedCanvas({ id: 'b1', layout: null }, spec, 'Roadmap')).toEqual(
      blankCanvas('Roadmap')
    );
    const stored = { format: 'texuli-canvas' };
    expect(storedCanvas({ id: 'b1', layout: stored }, spec, 'Roadmap')).toBe(stored);
  });
});

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

  it('switches records with the picker and paints each record’s own canvas', async () => {
    const note = (text: string) => ({
      format: 'texuli-canvas',
      formatVersion: 1,
      shapes: [{ id: 'n1', type: 'sticky', x: 0, y: 0, width: 160, height: 160, text }],
      connectors: [],
    });
    const { runtime, services } = await boot('owner', [
      { title: 'Roadmap', layout: note('Ship the beta') },
      { title: 'Retro', layout: note('Keep the demos short') },
    ]);
    render(CanvasScreen, { runtime, blueprint, services, screen: spec });
    const first = await screen.findByRole('img', { name: /Ship the beta|Keep the demos short/ });
    const other = first.getAttribute('aria-label') === 'Ship the beta' ? 'Retro' : 'Roadmap';
    await fireEvent.click(screen.getByRole('combobox', { name: 'Boards' }));
    await fireEvent.click(await screen.findByRole('option', { name: other }));
    await tick();
    expect(
      await screen.findByRole('img', {
        name: other === 'Retro' ? 'Keep the demos short' : 'Ship the beta',
      })
    ).toBeTruthy();
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

describe('catalog canvas seeds', () => {
  const catalog = ['home-renovation', 'product-discovery', 'lesson-planning'];

  it.each(catalog)('%s seeds every canvas field with a canvas the view accepts', async (slug) => {
    const raw = JSON.parse(
      readFileSync(
        join(resolve(import.meta.dirname, '../../..'), 'blueprints', `${slug}.json`),
        'utf8'
      )
    );
    const parsed = parseBlueprint(raw);
    const scenario = parseScenario({
      id: `canvas-${slug}`,
      name: 'Canvas catalog',
      seed: 9_001,
      referenceTime: '2026-06-15T12:00:00.000Z',
      density: 'normal',
      organization: { id: 'org_canvas', name: 'Canvas Org', size: 6, ageDays: 90 },
    });
    const world = await createBlueprintGenerator(parsed).generate(createGenerateContext(scenario));
    let checked = 0;
    for (const canvasScreen of parsed.screens) {
      if (canvasScreen.type !== 'canvas') continue;
      const owner = parsed.entities.find((candidate) => candidate.name === canvasScreen.entity)!;
      const rows = world.tables[entityTable(owner)] ?? [];
      expect(rows.length, slug).toBeGreaterThan(0);
      for (const row of rows) {
        const result = validateCanvas(row[canvasScreen.field]);
        expect(result.ok, `${slug} ${String(row.id)}: ${JSON.stringify(result)}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
