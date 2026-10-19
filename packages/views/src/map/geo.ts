/**
 * Plane math for the simulated map: Web Mercator views (center + zoom, the
 * slippy-map convention of a 256 px world at zoom 0), great-circle distance,
 * routes and nearest points. No tiles, no network, no geocoding.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

/** `[minLng, minLat, maxLng, maxLat]` */
export type Bbox = readonly [number, number, number, number];

export interface MapSize {
  width: number;
  height: number;
}

/** What the map shows: a center and a fractional zoom level. */
export interface MapView {
  center: LngLat;
  zoom: number;
}

const TILE = 256;
/** Web Mercator stops at about ±85.05°. */
const MAX_LAT = 85.05112878;
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;

/** Normalized Mercator coordinates in [0, 1] (x east, y south). */
export function mercator(point: LngLat): { x: number; y: number } {
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (point.lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

export function inverseMercator(x: number, y: number): LngLat {
  return {
    lng: x * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  };
}

function worldSize(zoom: number): number {
  return TILE * 2 ** zoom;
}

/** Screen position (px from the top-left of a map of `size`) of a point. */
export function project(point: LngLat, view: MapView, size: MapSize): { x: number; y: number } {
  const world = worldSize(view.zoom);
  const p = mercator(point);
  const c = mercator(view.center);
  return { x: (p.x - c.x) * world + size.width / 2, y: (p.y - c.y) * world + size.height / 2 };
}

/** The point under a screen position (the inverse of `project`). */
export function unproject(x: number, y: number, view: MapView, size: MapSize): LngLat {
  const world = worldSize(view.zoom);
  const c = mercator(view.center);
  return inverseMercator(c.x + (x - size.width / 2) / world, c.y + (y - size.height / 2) / world);
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** The view that shows `bbox` whole inside `size`, leaving `padding` px on each side. */
export function fitBounds(bbox: Bbox, size: MapSize, padding = 24): MapView {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const a = mercator({ lng: minLng, lat: maxLat });
  const b = mercator({ lng: maxLng, lat: minLat });
  const width = Math.max(1, size.width - 2 * padding);
  const height = Math.max(1, size.height - 2 * padding);
  const spanX = Math.max(b.x - a.x, 1e-9);
  const spanY = Math.max(b.y - a.y, 1e-9);
  const zoom = clampZoom(Math.log2(Math.min(width / spanX, height / spanY) / TILE));
  return { center: inverseMercator((a.x + b.x) / 2, (a.y + b.y) / 2), zoom };
}

/**
 * Zooms by `delta` levels keeping the point under `anchor` (screen px) fixed,
 * as wheel and pinch zoom do; without an anchor it zooms around the center.
 */
export function zoomAround(
  view: MapView,
  delta: number,
  size: MapSize,
  anchor?: { x: number; y: number }
): MapView {
  const zoom = clampZoom(view.zoom + delta);
  if (!anchor) return { center: view.center, zoom };
  const target = mercator(unproject(anchor.x, anchor.y, view, size));
  const world = worldSize(zoom);
  return {
    center: inverseMercator(
      target.x - (anchor.x - size.width / 2) / world,
      target.y - (anchor.y - size.height / 2) / world
    ),
    zoom,
  };
}

/** Moves the view by a screen offset (a drag or an arrow key). */
export function panBy(view: MapView, dx: number, dy: number, size: MapSize): MapView {
  return {
    center: unproject(size.width / 2 - dx, size.height / 2 - dy, view, size),
    zoom: view.zoom,
  };
}

/** The lng/lat box a view shows. */
export function viewBounds(view: MapView, size: MapSize): Bbox {
  const topLeft = unproject(0, 0, view, size);
  const bottomRight = unproject(size.width, size.height, view, size);
  return [topLeft.lng, bottomRight.lat, bottomRight.lng, topLeft.lat];
}

/** Mean Earth radius (IUGG), meters. */
const EARTH_RADIUS = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a route through `stops`, in meters. */
export function routeLength(stops: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++)
    total += haversine(stops[i - 1] as LngLat, stops[i] as LngLat);
  return total;
}

/** Seconds to drive `meters` at `speedKmh` (no traffic model: simulated). */
export function etaSeconds(meters: number, speedKmh: number): number {
  if (!(speedKmh > 0)) throw new RangeError('speed must be positive');
  return Math.round((meters / 1000 / speedKmh) * 3600);
}

/**
 * The point `meters` along a route (clamped to its ends), for moving markers
 * by simulated time: `pointAlong(route, speed * elapsed)`.
 */
export function pointAlong(stops: readonly LngLat[], meters: number): LngLat {
  if (stops.length === 0) throw new RangeError('a route needs at least one stop');
  let left = Math.max(0, meters);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1] as LngLat;
    const b = stops[i] as LngLat;
    const leg = haversine(a, b);
    if (left <= leg) {
      const t = leg === 0 ? 0 : left / leg;
      return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t };
    }
    left -= leg;
  }
  return stops[stops.length - 1] as LngLat;
}

/** The `k` points nearest to `target`, closest first (ties by id), with their distance in meters. */
export function nearest<T extends LngLat & { id: string }>(
  points: readonly T[],
  target: LngLat,
  k = 1
): { point: T; meters: number }[] {
  return points
    .map((point) => ({ point, meters: haversine(target, point) }))
    .sort(
      (a, b) =>
        a.meters - b.meters || (a.point.id < b.point.id ? -1 : a.point.id > b.point.id ? 1 : 0)
    )
    .slice(0, Math.max(0, k));
}
