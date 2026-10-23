import {
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { MapScreenSpec } from '../src/screens/map/index.ts';
import {
  CLUSTER_ABOVE,
  clusterCellSize,
  MapScreen,
  markersBbox,
  readPoint,
  rowsToMarkers,
} from '../src/screens/map/index.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Harbor dispatch',
  entities: [
    {
      name: 'stop',
      plural: 'stops',
      fields: [
        { name: 'name', kind: 'text', required: true },
        { name: 'position', kind: 'geo' },
        { name: 'status', kind: 'enum', values: ['waiting', 'enroute', 'delivered'] },
      ],
      titleField: 'name',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  screens: [{ type: 'map', entity: 'stop', geoField: 'position', colorBy: 'status' }],
});
const entity = blueprint.entities[0]!;
const mapScreen = blueprint.screens[0] as MapScreenSpec;

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
let harness = createHarness(definition('crud-map'));
beforeEach(() => {
  seq += 1;
  harness = createHarness(definition(`crud-map-${seq}`));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
  vi.restoreAllMocks();
});

describe('map screen helpers', () => {
  it('reads only valid geo points and pads the marker bounds', () => {
    expect(readPoint({ lat: -30.2, lng: -17.5 })).toEqual({ lat: -30.2, lng: -17.5 });
    expect(readPoint({ lat: 91, lng: 0 })).toBeNull();
    expect(readPoint({ lat: 0, lng: Number.NaN })).toBeNull();
    expect(markersBbox([])).toBeNull();
    expect(markersBbox([{ lat: 1, lng: 2 }])).toEqual([1.995, 0.995, 2.005, 1.005]);
    expect(clusterCellSize(CLUSTER_ABOVE)).toBe(1);
    expect(clusterCellSize(CLUSTER_ABOVE + 1)).toBe(56);
  });

  it('turns placed records into accessible markers with an enum legend style', () => {
    const markers = rowsToMarkers(
      [
        { id: 'a', name: 'Lighthouse', position: { lat: -30, lng: -18 }, status: 'enroute' },
        { id: 'b', name: 'Unplaced', position: null, status: 'waiting' },
      ],
      entity,
      mapScreen
    );
    expect(markers).toEqual([
      expect.objectContaining({
        id: 'a',
        label: 'Lighthouse',
        detail: 'enroute',
        lng: -18,
        lat: -30,
        tone: 'info',
        shape: 'square',
        glyph: 'E',
      }),
    ]);
    expect(CLUSTER_ABOVE).toBe(200);
  });
});

describe('MapScreen', () => {
  it('syncs markers and list selection, opens the chosen record, and makes no requests', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const lighthouseRow = await services.stop!.create({
      name: 'Lighthouse',
      position: { lat: -30.2, lng: -17.5 },
      status: 'enroute',
    });
    const pierRow = await services.stop!.create({
      name: 'North pier',
      position: { lat: -30.1, lng: -17.4 },
      status: 'waiting',
    });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const onOpenRecord = vi.fn();
    render(MapScreen, { runtime, blueprint, services, screen: mapScreen, onOpenRecord });

    // The marker and its list row are both buttons named after the record.
    const lighthouse = await screen.findAllByRole('button', { name: 'Lighthouse, enroute' });
    expect(lighthouse.map((button) => button.hasAttribute('data-marker'))).toEqual([true, false]);
    expect(document.querySelector(`[data-marker="${lighthouseRow.id}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-marker="${pierRow.id}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-list-item="${lighthouseRow.id}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-list-item="${pierRow.id}"]`)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Markers by status' }).textContent).toContain(
      'enroute'
    );

    const listItem = document.querySelector(
      `[data-list-item="${lighthouseRow.id}"]`
    ) as HTMLButtonElement;
    await fireEvent.click(listItem);
    expect(listItem.getAttribute('aria-current')).toBe('true');
    expect(document.querySelector('[data-selected-record]')?.textContent).toContain('Lighthouse');
    await fireEvent.click(screen.getByRole('button', { name: 'Open record' }));
    await waitFor(() =>
      expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lighthouse' }))
    );

    expect(lighthouse).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports unplaced records and omits invalid positions from the map', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const unplaced = await services.stop!.create({
      name: 'No position',
      position: null,
      status: 'waiting',
    });
    render(MapScreen, { runtime, blueprint, services, screen: mapScreen });
    const rows = await services.stop!.list();
    expect(rowsToMarkers(rows, entity, mapScreen).some((marker) => marker.id === unplaced.id)).toBe(
      false
    );
    expect(await screen.findByText(/records? (?:has|have) no position yet/)).toBeTruthy();
    expect(document.querySelector(`[data-marker="${unplaced.id}"]`)).toBeNull();
  });
});
