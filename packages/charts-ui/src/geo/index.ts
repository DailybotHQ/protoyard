// @protoyard/charts-ui/geo — tile-grid choropleth for named regions (no real borders shipped).
import type { ChartFamily } from '../families.ts';

export const FAMILY = 'geo' satisfies ChartFamily;

export { REGION_TILES, type Tile, WORLD_TILES } from './layouts.ts';
export { default as TileMap } from './TileMap.svelte';
