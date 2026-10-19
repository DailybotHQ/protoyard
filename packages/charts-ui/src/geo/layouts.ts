/*
 * Tile layouts: data-only grids of named regions (no borders, no real
 * geometry). Each tile is a cell at (col, row); a choropleth colors tiles by
 * value. `REGION_TILES` is a fictional territory; `WORLD_TILES` is a coarse,
 * borderless grid of large world regions for global breakdowns.
 */

export interface Tile {
  id: string;
  label: string;
  /** Short text printed on the tile (2–4 characters). */
  abbr: string;
  col: number;
  row: number;
}

/** Fictional districts of the Harbor Bay region used by scenario geo points. */
export const REGION_TILES: readonly Tile[] = [
  { id: 'north-ridge', label: 'North Ridge', abbr: 'NR', col: 1, row: 0 },
  { id: 'pine-hollow', label: 'Pine Hollow', abbr: 'PH', col: 2, row: 0 },
  { id: 'west-shore', label: 'West Shore', abbr: 'WS', col: 0, row: 1 },
  { id: 'old-town', label: 'Old Town', abbr: 'OT', col: 1, row: 1 },
  { id: 'harbor-point', label: 'Harbor Point', abbr: 'HP', col: 2, row: 1 },
  { id: 'east-quay', label: 'East Quay', abbr: 'EQ', col: 3, row: 1 },
  { id: 'mill-district', label: 'Mill District', abbr: 'MD', col: 0, row: 2 },
  { id: 'lantern-row', label: 'Lantern Row', abbr: 'LR', col: 1, row: 2 },
  { id: 'coral-flats', label: 'Coral Flats', abbr: 'CF', col: 2, row: 2 },
  { id: 'south-bend', label: 'South Bend', abbr: 'SB', col: 1, row: 3 },
  { id: 'tidewater', label: 'Tidewater', abbr: 'TW', col: 2, row: 3 },
];

/** Large world regions on a rough west-to-east, north-to-south grid. */
export const WORLD_TILES: readonly Tile[] = [
  { id: 'north-america', label: 'North America', abbr: 'NAM', col: 0, row: 0 },
  { id: 'northern-europe', label: 'Northern Europe', abbr: 'NEU', col: 2, row: 0 },
  { id: 'eastern-europe', label: 'Eastern Europe', abbr: 'EEU', col: 3, row: 0 },
  { id: 'central-asia', label: 'Central Asia', abbr: 'CAS', col: 4, row: 0 },
  { id: 'east-asia', label: 'East Asia', abbr: 'EAS', col: 5, row: 0 },
  { id: 'central-america', label: 'Central America & Caribbean', abbr: 'CAM', col: 0, row: 1 },
  { id: 'western-europe', label: 'Western Europe', abbr: 'WEU', col: 2, row: 1 },
  { id: 'southern-europe', label: 'Southern Europe', abbr: 'SEU', col: 3, row: 1 },
  { id: 'middle-east', label: 'Middle East', abbr: 'MEA', col: 4, row: 1 },
  { id: 'south-asia', label: 'South Asia', abbr: 'SAS', col: 5, row: 1 },
  { id: 'south-america', label: 'South America', abbr: 'SAM', col: 1, row: 2 },
  { id: 'north-africa', label: 'North Africa', abbr: 'NAF', col: 3, row: 2 },
  { id: 'southeast-asia', label: 'Southeast Asia', abbr: 'SEA', col: 5, row: 2 },
  { id: 'sub-saharan-africa', label: 'Sub-Saharan Africa', abbr: 'SSA', col: 3, row: 3 },
  { id: 'oceania', label: 'Oceania', abbr: 'OCE', col: 6, row: 3 },
];
