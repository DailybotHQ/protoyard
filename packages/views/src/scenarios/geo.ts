import type { BasemapFeature, MapPoint } from '../map/index.ts';
import {
  type Geofence,
  haversine,
  type LngLat,
  PORT_MERIDIAN,
  pointInRing,
  type Ring,
} from '../map/index.ts';
import { countFor, type ViewsCtx, type ViewsLevel, viewsLevel, viewsRng } from './shared.ts';

export interface GeoSite extends MapPoint {
  name: string;
  kind: 'customer' | 'depot' | 'job';
  /** The Port Meridian district it lies in. */
  districtId: string;
}

export interface GeoRoute {
  id: string;
  name: string;
  /** Ordered stops, starting at the depot. */
  stopIds: string[];
  stops: LngLat[];
}

export interface GeoWorld {
  sites: GeoSite[];
  routes: GeoRoute[];
  geofences: Geofence[];
}

export interface GeoWorldOptions {
  level?: ViewsLevel;
  /** Stops per route (default 6). */
  stopsPerRoute?: number;
}

const STREETS = [
  'Harbor',
  'Mill',
  'Lantern',
  'Gull',
  'Cedar',
  'Quay',
  'Beacon',
  'Tide',
  'Ropewalk',
  'Anchor',
];

function ringOf(feature: BasemapFeature): Ring {
  const ring: Ring = [];
  for (let i = 0; i < feature.coords.length; i += 2) {
    ring.push([feature.coords[i] as number, feature.coords[i + 1] as number]);
  }
  return ring;
}

/**
 * Sites, routes and geofences on the fictional Port Meridian basemap: points
 * are sampled inside its districts (never in the sea), each route visits the
 * nearest unvisited stop next from a depot, and each geofence is a regular
 * polygon around a district label (so it can never cross itself).
 */
export function generateGeoWorld(ctx: ViewsCtx, options: GeoWorldOptions = {}): GeoWorld {
  const level = viewsLevel(ctx, 'geo', options.level);
  const count = countFor(level, [0, 60, 2000, 40]);
  if (count === 0) return { sites: [], routes: [], geofences: [] };
  const rng = viewsRng(ctx, 'geo');
  const districts = PORT_MERIDIAN.features.filter((f) => f.kind === 'district');
  const rings = districts.map((d) => ({ feature: d, ring: ringOf(d) }));

  const sample = (target: (typeof rings)[number]): LngLat => {
    const lngs = target.ring.map(([x]) => x);
    const lats = target.ring.map(([, y]) => y);
    const [minLng, maxLng, minLat, maxLat] = [
      Math.min(...lngs),
      Math.max(...lngs),
      Math.min(...lats),
      Math.max(...lats),
    ];
    for (let attempt = 0; attempt < 200; attempt++) {
      const point = { lng: rng.float(minLng, maxLng), lat: rng.float(minLat, maxLat) };
      if (pointInRing(point, target.ring))
        return { lng: Math.round(point.lng * 1e5) / 1e5, lat: Math.round(point.lat * 1e5) / 1e5 };
    }
    const [lng, lat] = target.feature.label ?? [lngs[0] as number, lats[0] as number];
    return { lng, lat };
  };

  const sites: GeoSite[] = [];
  const depots = rings.map((target) => {
    const at = target.feature.label
      ? { lng: target.feature.label[0], lat: target.feature.label[1] }
      : sample(target);
    const site: GeoSite = {
      id: ctx.ids.next('site'),
      name: `${target.feature.name} depot`,
      kind: 'depot',
      districtId: target.feature.id,
      ...at,
    };
    sites.push(site);
    return site;
  });
  for (let i = 0; i < count; i++) {
    const target = rng.pick(rings);
    sites.push({
      id: ctx.ids.next('site'),
      name: `${rng.int(1, 240)} ${rng.pick(STREETS)} ${rng.pick(['Street', 'Lane', 'Row', 'Way'])}`,
      kind: rng.chance(0.6) ? 'job' : 'customer',
      districtId: target.feature.id,
      ...sample(target),
    });
  }
  if (level === 'edge') {
    // Two sites at the same spot: clustering and marker spreading must cope.
    const twin = sites[sites.length - 1] as GeoSite;
    sites.push({ ...twin, id: ctx.ids.next('site'), name: `${twin.name} (rear)` });
  }

  const stopsPerRoute = options.stopsPerRoute ?? 6;
  const routes: GeoRoute[] = depots.map((depot, r) => {
    const pool = sites.filter((s) => s.kind === 'job' && s.districtId === depot.districtId);
    const stops: GeoSite[] = [depot];
    const left = [...pool];
    while (stops.length <= stopsPerRoute && left.length > 0) {
      const last = stops[stops.length - 1] as GeoSite;
      left.sort((a, b) => haversine(last, a) - haversine(last, b) || (a.id < b.id ? -1 : 1));
      stops.push(left.shift() as GeoSite);
    }
    return {
      id: ctx.ids.next('route'),
      name: `Route ${String.fromCharCode(65 + r)}`,
      stopIds: stops.map((s) => s.id),
      stops: stops.map(({ lng, lat }) => ({ lng, lat })),
    };
  });

  const geofences: Geofence[] = depots.map((depot, i) => {
    const sides = 8;
    // About 1.5–4 km (edge: a 50 m fence that almost nothing enters).
    const radius = level === 'edge' && i === 0 ? 0.0005 : rng.float(0.015, 0.04);
    const ring: Ring = Array.from({ length: sides }, (_, k) => {
      const angle = (2 * Math.PI * k) / sides;
      return [
        Math.round((depot.lng + radius * Math.cos(angle)) * 1e5) / 1e5,
        Math.round((depot.lat + radius * Math.sin(angle)) * 1e5) / 1e5,
      ] as [number, number];
    });
    return {
      id: ctx.ids.next('fence'),
      name: `${depot.name.replace(' depot', '')} zone`,
      shape: 'polygon',
      ring,
    };
  });

  return { sites, routes, geofences };
}
