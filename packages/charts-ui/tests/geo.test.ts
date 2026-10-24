import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { TileMap, WORLD_TILES } from '../src/geo/index.ts';

afterEach(() => cleanup());

describe('geo adapters over @texuli/charts', () => {
  it('exports WORLD_TILES and renders TileMap', () => {
    expect(WORLD_TILES.length).toBeGreaterThan(0);
    const data: Record<string, number> = {};
    for (const t of WORLD_TILES.slice(0, 5)) data[t.id] = 10;
    render(TileMap, { title: 'Map', description: 'World revenue', data });
    expect(screen.getByRole('img', { name: /Map|World/ })).toBeTruthy();
  });
});
