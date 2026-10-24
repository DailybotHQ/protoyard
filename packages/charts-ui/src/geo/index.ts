import type { ChartFamily } from '../families.ts';

export const FAMILY = 'geo' satisfies ChartFamily;

export { GeoMap, GeoPointMap, REGION_TILES, WORLD_TILES } from '@texuli/charts/geo';
export { default as TileMap } from './TileMap.svelte';
export type { GeoTile, Tile } from './types.ts';
