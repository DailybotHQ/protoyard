import { createRng, type GenerateContext } from '@protoyard/core';

/**
 * Fictional geography for maps. Every region sits in open ocean, far from
 * any coastline, so generated points can never resolve to a real address;
 * names are invented. Point `i` has its own rng, so asking for more points
 * keeps the earlier ones.
 */

type ScenarioCtx = Pick<GenerateContext, 'scenario'>;

export interface GeoAnchor {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Relative share of points around this anchor. */
  weight: number;
}

export interface GeoRegion {
  id: string;
  name: string;
  /** `[minLng, minLat, maxLng, maxLat]` */
  bbox: readonly [number, number, number, number];
  anchors: readonly GeoAnchor[];
}

export interface GeoPoint {
  /** `geo:<key>:<index>`, stable. */
  id: string;
  lat: number;
  lng: number;
  /** The anchor the point clusters around. */
  anchorId: string;
}

const anchor = (id: string, name: string, lat: number, lng: number, weight = 1): GeoAnchor => ({
  id,
  name,
  lat,
  lng,
  weight,
});

/** Fictional regions (open-ocean coordinates). */
export const GEO_REGIONS = {
  /** South Atlantic, ~1,500 km from the nearest coast. */
  'harbor-bay': {
    id: 'harbor-bay',
    name: 'Harbor Bay',
    bbox: [-20, -32, -17, -30],
    anchors: [
      anchor('north-pier', 'North Pier', -30.4, -18.6, 3),
      anchor('old-mill', 'Old Mill', -31.1, -19.2, 2),
      anchor('lantern-point', 'Lantern Point', -31.6, -17.8, 1),
    ],
  },
  /** North Pacific, north-east of any island chain. */
  'north-valley': {
    id: 'north-valley',
    name: 'North Valley',
    bbox: [-150, 30, -147, 32],
    anchors: [
      anchor('cedar-junction', 'Cedar Junction', 31.2, -148.9, 2),
      anchor('river-fork', 'River Fork', 30.6, -147.8, 2),
      anchor('high-meadow', 'High Meadow', 31.7, -149.5, 1),
    ],
  },
  /** Indian Ocean, open water south of the equator. */
  'metro-grid': {
    id: 'metro-grid',
    name: 'Metro Grid',
    bbox: [80, -20, 83, -18],
    anchors: [
      anchor('central', 'Central District', -19.0, 81.5, 4),
      anchor('east-yards', 'East Yards', -18.7, 82.4, 2),
      anchor('south-loop', 'South Loop', -19.6, 80.9, 2),
      anchor('airfield', 'Airfield', -18.4, 80.6, 1),
    ],
  },
  /** South Pacific, near the oceanic pole of inaccessibility. */
  'coral-reach': {
    id: 'coral-reach',
    name: 'Coral Reach',
    bbox: [-125, -45, -122, -43],
    anchors: [
      anchor('reef-station', 'Reef Station', -44.1, -123.6, 2),
      anchor('tide-gate', 'Tide Gate', -43.5, -122.7, 1),
    ],
  },
} as const satisfies Record<string, GeoRegion>;

export type GeoRegionId = keyof typeof GEO_REGIONS;
export const GEO_REGION_IDS = Object.keys(GEO_REGIONS) as GeoRegionId[];

export interface GeoPointsOptions {
  ctx: ScenarioCtx;
  region: GeoRegionId;
  count: number;
  /** Separate point sets of one scenario: `'stores'`, `'stops'`… (default the region id). */
  key?: string;
  /** Use only the first `clusters` anchors (default all). */
  clusters?: number;
  /** Standard deviation around an anchor, in degrees (default 0.15). */
  spread?: number;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Points clustered around a region's anchors, clamped to its bounding box. */
export function geoPoints(options: GeoPointsOptions): GeoPoint[] {
  const region: GeoRegion = GEO_REGIONS[options.region];
  if (!region) throw new RangeError(`geoPoints(): unknown region "${options.region}"`);
  if (!Number.isInteger(options.count) || options.count < 0 || options.count > 1_000_000) {
    throw new RangeError('geoPoints(): count must be an integer between 0 and 1000000');
  }
  const anchors = region.anchors.slice(0, Math.max(1, options.clusters ?? region.anchors.length));
  const weighted = anchors.map((a) => [a, a.weight] as const);
  const spread = options.spread ?? 0.15;
  const key = options.key ?? region.id;
  const [minLng, minLat, maxLng, maxLat] = region.bbox;
  const { id: scenarioId, seed } = options.ctx.scenario;

  return Array.from({ length: options.count }, (_, index) => {
    const rng = createRng(`protoyard:geo:${scenarioId}:${seed}:${key}:${index}`);
    const center = rng.weighted(weighted);
    // Box-Muller: two independent normal offsets.
    const radius = Math.sqrt(-2 * Math.log(Math.max(rng.next(), Number.EPSILON))) * spread;
    const angle = 2 * Math.PI * rng.next();
    return {
      id: `geo:${key}:${index}`,
      lat: round5(Math.min(maxLat, Math.max(minLat, center.lat + radius * Math.sin(angle)))),
      lng: round5(Math.min(maxLng, Math.max(minLng, center.lng + radius * Math.cos(angle)))),
      anchorId: center.id,
    };
  });
}

/** True when the point lies inside the region's bounding box. */
export function inGeoRegion(point: Pick<GeoPoint, 'lat' | 'lng'>, region: GeoRegionId): boolean {
  const [minLng, minLat, maxLng, maxLat] = GEO_REGIONS[region].bbox;
  return point.lat >= minLat && point.lat <= maxLat && point.lng >= minLng && point.lng <= maxLng;
}
