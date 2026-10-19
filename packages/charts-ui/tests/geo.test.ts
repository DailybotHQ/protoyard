import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGION_TILES, WORLD_TILES } from '../src/geo/layouts.ts';
import TileMap from '../src/geo/TileMap.svelte';

class FixedWidthObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 600, height: 260 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal('ResizeObserver', FixedWidthObserver));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const live = () => document.querySelector('[data-chart-live]')?.textContent ?? '';

describe('tile layouts', () => {
  it('place every tile on its own cell', () => {
    for (const layout of [REGION_TILES, WORLD_TILES]) {
      const positions = layout.map((t) => `${t.col}:${t.row}`);
      expect(new Set(positions).size).toBe(layout.length);
      expect(new Set(layout.map((t) => t.id)).size).toBe(layout.length);
      for (const t of layout) expect(t.abbr.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('TileMap', () => {
  const data = { 'north-ridge': 120, 'old-town': 340, 'harbor-point': 80, tidewater: 0 };

  it('draws one tile per region, colored by value, with no-data tiles distinct', () => {
    render(TileMap, { title: 'Riders by district', layout: REGION_TILES, data });
    expect(document.querySelectorAll('[data-tile]')).toHaveLength(REGION_TILES.length);
    const fill = (id: string) =>
      document.querySelector(`[data-tile="${id}"] rect`)?.getAttribute('fill');
    expect(fill('old-town')).toBe('var(--py-seq-9)');
    expect(fill('tidewater')).toBe('var(--py-seq-1)');
    expect(fill('pine-hollow')).toBe('var(--py-muted)');
    expect(
      document.querySelector('[data-tile="pine-hollow"] rect')?.getAttribute('stroke-dasharray')
    ).toBe('3 2');
    expect(document.querySelector('[data-ramp-max]')?.textContent).toBe('340');
    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.getByRole('figure').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('moves between tiles by row and column and selects one', async () => {
    const onselect = vi.fn();
    render(TileMap, { title: 'Riders', layout: REGION_TILES, data, onselect });
    const svg = screen.getByRole('group', { name: /^Riders\./ });
    await fireEvent.focus(svg);
    expect(live()).toBe('North Ridge: 120');
    await fireEvent.keyDown(svg, { key: 'ArrowDown' });
    expect(live()).toBe('Old Town: 340');
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(live()).toBe('Harbor Point: 80');
    await fireEvent.keyDown(svg, { key: 'ArrowDown' });
    expect(live()).toBe('Coral Flats: no data');
    await fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onselect.mock.calls[0]?.[0].id).toBe('coral-flats');
    expect(onselect.mock.calls[0]?.[1]).toBeNull();
  });

  it('defaults to the world grid and shows the empty state without data', () => {
    render(TileMap, { title: 'Revenue', data: { 'western-europe': 5 } });
    expect(document.querySelectorAll('[data-tile]')).toHaveLength(WORLD_TILES.length);
    cleanup();
    render(TileMap, { title: 'Nothing', data: {}, emptyMessage: 'No regions yet' });
    expect(screen.getByText('No regions yet')).toBeTruthy();
  });
});
