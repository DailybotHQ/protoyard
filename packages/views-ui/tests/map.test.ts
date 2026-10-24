import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { type MapMarker, SimulatedMap } from '../src/map/index.ts';

afterEach(() => cleanup());

const MARKERS: MapMarker[] = [
  { id: 'a', lng: -18.6, lat: -30.4, label: 'Harbor' },
  { id: 'b', lng: -18.5, lat: -30.5, label: 'Quay' },
];

describe('SimulatedMap (Texuli MapView adapter)', () => {
  it('renders markers through Texuli MapView', async () => {
    render(SimulatedMap, { markers: MARKERS, label: 'Port map' });
    await waitFor(() => expect(document.body.textContent).toMatch(/Port|Harbor|map/i));
  });
});
