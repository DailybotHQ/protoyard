import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type MapMarker, type MapRoute, SimulatedMap } from '../src/map/index.ts';

afterEach(() => cleanup());

const MARKERS: MapMarker[] = [
  {
    id: 'depot',
    lng: -18.6,
    lat: -30.4,
    label: 'Harbor depot',
    detail: 'Depot',
    tone: 'primary',
    shape: 'square',
    glyph: 'D',
  },
  {
    id: 'vehicle',
    lng: -18.5,
    lat: -30.5,
    label: 'Van 1',
    detail: 'In transit',
    tone: 'success',
    shape: 'triangle',
    glyph: 'V',
  },
];

const ROUTES: MapRoute[] = [
  {
    id: 'r1',
    label: 'HB-4100 route',
    stops: [
      { lng: -18.6, lat: -30.4 },
      { lng: -18.5, lat: -30.5 },
    ],
    progress: 0.4,
    tone: 'success',
  },
];

describe('SimulatedMap (Texuli MapView adapter)', () => {
  it('renders markers through Texuli MapView', async () => {
    render(SimulatedMap, { markers: MARKERS, label: 'Port map' });
    await waitFor(() => expect(document.body.textContent).toMatch(/Port|Harbor|map/i));
  });

  it('forwards routes, glyphs, cellPx and list-below placement', async () => {
    render(SimulatedMap, {
      markers: MARKERS,
      routes: ROUTES,
      label: 'Dispatch map',
      listLabel: 'Depots and shipments',
      listPlacement: 'below',
      cellPx: 1,
    });
    await waitFor(() => expect(document.querySelector('[data-map-view]')).toBeTruthy());
    // Glyphs and route labels surface in the map chrome / list.
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Harbor depot|Van 1|HB-4100|route/i)
    );
    expect(document.querySelector('[data-marker="depot"], [data-list-item="depot"]')).toBeTruthy();
    expect(document.querySelector('.map-view.list-below, [class*="list-below"]')).toBeTruthy();
  });

  it('exposes data-center/data-zoom and forwards onViewChange', async () => {
    const onViewChange = vi.fn();
    render(SimulatedMap, {
      markers: MARKERS,
      label: 'Camera map',
      cellPx: 1,
      onViewChange,
    });
    const surface = await screen.findByRole('region', { name: /map with interactive/i });
    await waitFor(() =>
      expect(surface.getAttribute('data-center')).toMatch(/^-?\d+\.\d{4},-?\d+\.\d{4}$/)
    );
    expect(surface.getAttribute('data-zoom')).toBeTruthy();
    const before = surface.getAttribute('data-center');
    surface.focus();
    await fireEvent.keyDown(surface, { key: 'ArrowRight' });
    await waitFor(() => expect(surface.getAttribute('data-center')).not.toBe(before));
    expect(onViewChange.mock.calls.length).toBeGreaterThan(0);
    const last = onViewChange.mock.calls.at(-1)?.[0] as {
      center: { lat: number; lng: number };
      zoom: number;
    };
    expect(Number.isFinite(last.center.lat)).toBe(true);
    expect(Number.isFinite(last.zoom)).toBe(true);
  });
});
