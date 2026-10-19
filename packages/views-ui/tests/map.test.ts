import type { Geofence } from '@protoyard/views/map';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type MapMarker,
  type MapRoute,
  ringProblem,
  routeProgress,
  SimulatedMap,
} from '../src/map/index.ts';

afterEach(() => cleanup());

/** Five vans on one Port Meridian street and two depots far apart (all fictional). */
const VANS: MapMarker[] = [-18.62, -18.61, -18.6, -18.59, -18.58].map((lng, i) => ({
  id: `van-${i + 1}`,
  label: `Van ${i + 1}`,
  detail: 'Delivering',
  lng,
  lat: -30.4,
  shape: 'square',
  glyph: 'V',
}));
const DEPOTS: MapMarker[] = [
  {
    id: 'depot-west',
    label: 'West depot',
    lng: -19.5,
    lat: -31.5,
    tone: 'success',
    shape: 'diamond',
    glyph: 'D',
  },
  {
    id: 'depot-east',
    label: 'East depot',
    lng: -17.5,
    lat: -30.2,
    tone: 'success',
    shape: 'diamond',
    glyph: 'D',
  },
];
const ROUTE: MapRoute = {
  id: 'route-1',
  label: 'Morning loop',
  stops: [
    { lng: -19.5, lat: -31.5 },
    { lng: -18.6, lat: -30.4 },
    { lng: -17.5, lat: -30.2 },
  ],
  progress: 0.5,
};
const YARD: Geofence = {
  id: 'yard',
  name: 'Harbor yard',
  shape: 'polygon',
  ring: [
    [-18.7, -30.5],
    [-18.5, -30.5],
    [-18.5, -30.3],
    [-18.7, -30.3],
  ],
};

const region = () => screen.getByRole('region', { name: /Arrow keys pan/ });
const zoom = () => Number(region().getAttribute('data-zoom'));
const center = () =>
  region().getAttribute('data-center')?.split(',').map(Number) as [number, number];
const marker = (id: string) =>
  document.querySelector(`[data-marker="${id}"]`) as HTMLElement | null;

describe('SimulatedMap', () => {
  it('draws the fictional basemap with an always-visible attribution', () => {
    render(SimulatedMap, { markers: DEPOTS });
    expect(document.querySelectorAll('svg path').length).toBeGreaterThan(5);
    const chip = document.querySelector('[data-map-attribution]') as HTMLElement;
    expect(chip.textContent?.trim()).toBe('Simulated map. Fictional city, not real geography.');
    expect(chip.getAttribute('title')).toMatch(/fictional/);
    expect(marker('depot-west')?.getAttribute('aria-label')).toBe('West depot');
  });

  it('pans with the arrow keys, zooms with + and -, and resets with 0', async () => {
    render(SimulatedMap, { markers: DEPOTS });
    const start = zoom();
    const [lng0, lat0] = center();
    await fireEvent.keyDown(region(), { key: 'ArrowRight' });
    expect(center()[0]).toBeGreaterThan(lng0);
    await fireEvent.keyDown(region(), { key: 'ArrowUp' });
    expect(center()[1]).toBeGreaterThan(lat0);
    await fireEvent.keyDown(region(), { key: '+' });
    expect(zoom()).toBeCloseTo(start + 1, 5);
    await fireEvent.keyDown(region(), { key: '-' });
    await fireEvent.keyDown(region(), { key: '-' });
    expect(zoom()).toBeCloseTo(start - 1, 5);
    await fireEvent.keyDown(region(), { key: '0' });
    expect(zoom()).toBeCloseTo(start, 5);
    expect(center()[0]).toBeCloseTo(lng0, 4);
  });

  it('zooms with the buttons, the wheel and pans by dragging', async () => {
    render(SimulatedMap, { markers: DEPOTS });
    const start = zoom();
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(zoom()).toBeCloseTo(start + 1, 5);
    await fireEvent.wheel(region(), { deltaY: 300, clientX: 320, clientY: 200 });
    expect(zoom()).toBeCloseTo(start, 5);
    const [lng0] = center();
    const svg = region().querySelector('svg') as SVGElement;
    await fireEvent.pointerDown(svg, { pointerId: 1, clientX: 300, clientY: 200 });
    await fireEvent.pointerMove(region(), { pointerId: 1, clientX: 200, clientY: 200 });
    await fireEvent.pointerUp(region(), { pointerId: 1 });
    expect(center()[0]).toBeGreaterThan(lng0);
  });

  it('clusters nearby markers and expands a cluster when activated', async () => {
    render(SimulatedMap, { markers: [...VANS, ...DEPOTS] });
    const clusterButton = screen.getByRole('button', { name: '5 places. Zoom in to see them' });
    expect(marker('van-1')).toBeNull();
    const before = zoom();
    await fireEvent.click(clusterButton);
    expect(zoom()).toBeGreaterThan(before + 1);
    for (const van of VANS) expect(marker(van.id)).toBeTruthy();
    // The list always shows every marker, clustered or not.
    expect(document.querySelectorAll('[data-list-item]')).toHaveLength(7);
  });

  it('selects a marker and keeps the list in sync both ways', async () => {
    const onSelect = vi.fn();
    render(SimulatedMap, { markers: DEPOTS, onSelect });
    await fireEvent.click(marker('depot-west') as HTMLElement);
    expect(onSelect).toHaveBeenLastCalledWith('depot-west');
    expect(marker('depot-west')?.getAttribute('aria-pressed')).toBe('true');
    expect(
      document.querySelector('[data-list-item="depot-west"]')?.getAttribute('aria-current')
    ).toBe('true');

    await fireEvent.click(document.querySelector('[data-list-item="depot-east"]') as HTMLElement);
    expect(onSelect).toHaveBeenLastCalledWith('depot-east');
    expect(marker('depot-east')?.getAttribute('aria-pressed')).toBe('true');
    expect(marker('depot-west')?.getAttribute('aria-pressed')).toBe('false');
    // Choosing from the list centers the map on the place.
    expect(center()[0]).toBeCloseTo(-17.5, 4);
    expect(center()[1]).toBeCloseTo(-30.2, 4);

    await fireEvent.keyDown(region(), { key: 'Escape' });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('follows a bound selection and animates markers moved by props', async () => {
    const { rerender } = render(SimulatedMap, { markers: DEPOTS, selected: 'depot-east' });
    expect(marker('depot-east')?.getAttribute('aria-pressed')).toBe('true');
    const left = marker('depot-west')?.style.left;
    expect(marker('depot-west')?.className).toMatch(/motion-reduce:transition-none/);
    await rerender({
      markers: [{ ...DEPOTS[0], lng: -19.4 } as MapMarker, DEPOTS[1] as MapMarker],
      selected: 'depot-west',
    });
    expect(marker('depot-west')?.style.left).not.toBe(left);
    expect(marker('depot-west')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('draws routes with progress and lists them', () => {
    render(SimulatedMap, { markers: DEPOTS, routes: [ROUTE] });
    expect(document.querySelector('[data-route="route-1"]')?.getAttribute('d')).toMatch(
      /^M[\d.-]+ [\d.-]+L/
    );
    expect(document.querySelector('[data-route-travelled="route-1"]')).toBeTruthy();
    expect(document.querySelector('[data-route-position="route-1"]')).toBeTruthy();
    expect(document.querySelector('[data-route-item="route-1"]')?.textContent).toMatch(
      /Morning loop: 50% done/
    );
  });

  it('edits a fence by its corner list and saves through onFenceChange', async () => {
    const onFenceChange = vi.fn(async (_fence: Geofence) => {});
    render(SimulatedMap, { fences: [YARD], editableFenceId: 'yard', onFenceChange });
    expect(document.querySelectorAll('[data-vertex]')).toHaveLength(4);
    const save = screen.getByRole('button', { name: 'Save fence' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await fireEvent.input(screen.getByLabelText('Corner 3 latitude'), {
      target: { value: '-30.25' },
    });
    expect(save.disabled).toBe(false);
    await fireEvent.click(save);
    await waitFor(() => expect(onFenceChange).toHaveBeenCalledTimes(1));
    expect(
      (onFenceChange.mock.calls[0]?.[0] as Extract<Geofence, { shape: 'polygon' }> | undefined)
        ?.ring[2]
    ).toEqual([-18.5, -30.25]);

    await fireEvent.click(screen.getByRole('button', { name: 'Add a corner after corner 1' }));
    expect(document.querySelectorAll('[data-corner]')).toHaveLength(5);
    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(document.querySelectorAll('[data-corner]')).toHaveLength(4);
  });

  it('refuses a self-crossing fence and keeps the map read-only without onFenceChange', async () => {
    const { unmount } = render(SimulatedMap, {
      fences: [YARD],
      editableFenceId: 'yard',
      onFenceChange: vi.fn(),
    });
    // Swap corners 2 and 3 into a bowtie, so two edges cross.
    await fireEvent.input(screen.getByLabelText('Corner 2 latitude'), {
      target: { value: '-30.3' },
    });
    await fireEvent.input(screen.getByLabelText('Corner 3 latitude'), {
      target: { value: '-30.5' },
    });
    expect(screen.getByRole('alert').textContent).toMatch(/edges cross/);
    expect((screen.getByRole('button', { name: 'Save fence' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    unmount();

    render(SimulatedMap, { fences: [YARD], editableFenceId: 'yard' });
    expect(document.querySelector('[data-fence="yard"]')).toBeTruthy();
    expect(document.querySelector('[data-fence-editor]')).toBeNull();
    expect(document.querySelectorAll('[data-vertex]')).toHaveLength(0);
  });

  it('renders 5,000 markers as clusters while the list keeps every one', () => {
    // A deterministic grid over Port Meridian (no Math.random).
    const many: MapMarker[] = Array.from({ length: 5_000 }, (_, i) => ({
      id: `job-${i}`,
      label: `Job ${i}`,
      lng: -19.9 + (i % 100) * 0.028,
      lat: -31.9 + Math.floor(i / 100) * 0.036,
    }));
    const started = performance.now();
    render(SimulatedMap, { markers: many });
    const ms = performance.now() - started;
    const drawn = document.querySelectorAll('[data-cluster], [data-marker]').length;
    console.info(
      `SimulatedMap 5,000 markers: ${ms.toFixed(0)} ms in happy-dom, ${drawn} map buttons`
    );
    expect(drawn).toBeLessThan(500);
    expect(document.querySelectorAll('[data-cluster]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-list-item]')).toHaveLength(5_000);
    // The browser budget (100 ms) is measured in E2E; happy-dom is far slower.
    expect(ms).toBeLessThan(10_000);
  });

  it('picks a point with Enter at the center cross, or by clicking without dragging', async () => {
    const onPick = vi.fn();
    render(SimulatedMap, { onPick });
    expect(document.querySelector('[data-crosshair]')).toBeTruthy();
    expect(region().getAttribute('aria-label')).toMatch(/Enter picks the point/);
    await fireEvent.keyDown(region(), { key: 'Enter' });
    const [lng, lat] = center();
    expect(onPick).toHaveBeenLastCalledWith({
      lng: expect.closeTo(lng, 4),
      lat: expect.closeTo(lat, 4),
    });

    const svg = region().querySelector('svg') as SVGElement;
    await fireEvent.pointerDown(svg, { pointerId: 2, clientX: 420, clientY: 200 });
    await fireEvent.pointerUp(region(), { pointerId: 2, clientX: 421, clientY: 201 });
    expect(onPick).toHaveBeenCalledTimes(2);
    const picked = onPick.mock.lastCall?.[0] as { lng: number } | undefined;
    if (!picked) throw new Error('Expected a point to be picked');
    expect(picked.lng).toBeGreaterThan(lng);

    // A drag pans and does not pick.
    await fireEvent.pointerDown(svg, { pointerId: 3, clientX: 300, clientY: 200 });
    await fireEvent.pointerMove(region(), { pointerId: 3, clientX: 250, clientY: 200 });
    await fireEvent.pointerUp(region(), { pointerId: 3, clientX: 250, clientY: 200 });
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  it('has no crosshair and does not pick without onPick', async () => {
    render(SimulatedMap, {});
    expect(document.querySelector('[data-crosshair]')).toBeNull();
    await fireEvent.keyDown(region(), { key: 'Enter' });
  });

  it('helpers: route progress and ring checks', () => {
    const { travelled, at } = routeProgress({ ...ROUTE, progress: 1 });
    expect(at).toEqual({ lng: -17.5, lat: -30.2 });
    expect(travelled.length).toBeGreaterThanOrEqual(3);
    expect(
      ringProblem([
        [0, 0],
        [1, 1],
      ] as never)
    ).toMatch(/three corners/);
    expect(
      ringProblem([
        [0, 0],
        [0, 100],
        [1, 1],
      ] as never)
    ).toMatch(/Latitudes/);
    expect(ringProblem(YARD.shape === 'polygon' ? YARD.ring : [])).toBeNull();
  });
});
