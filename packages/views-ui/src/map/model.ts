export type { LngLat } from '@protoyard/views/map';

import {
  type Geofence,
  type LngLat,
  type MapSize,
  type MapView,
  pointAlong,
  project,
  type Ring,
  ringSelfIntersects,
  routeLength,
} from '@protoyard/views/map';

export type MapTone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangle';

/** A place on the map. Shape and glyph carry meaning too, never color alone. */
export interface MapMarker extends LngLat {
  id: string;
  label: string;
  /** Extra text for the marker's name and the list ("Delivering · 3 stops left"). */
  detail?: string;
  tone?: MapTone;
  shape?: MarkerShape;
  /** One or two characters drawn on the marker ("D", "!"). */
  glyph?: string;
}

/** A route through stops; `progress` (0–1) splits it into travelled and remaining. */
export interface MapRoute {
  id: string;
  label: string;
  stops: LngLat[];
  progress?: number;
  tone?: MapTone;
}

/** Solid fills with their AA foreground, from theme tokens. */
export const TONE_FILL: Record<MapTone, string> = {
  primary: 'bg-primary text-primary-foreground',
  info: 'bg-info text-info-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted-foreground text-background',
};

/** SVG stroke classes for routes and fences. */
export const TONE_STROKE: Record<MapTone, string> = {
  primary: 'stroke-primary',
  info: 'stroke-info',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-destructive',
  neutral: 'stroke-muted-foreground',
};

/** Pixels an arrow key pans. */
export const PAN_STEP = 64;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** SVG path data (numbers and M/L/Z only) through `points`. */
export function linePath(
  points: readonly LngLat[],
  view: MapView,
  size: MapSize,
  close = false
): string {
  const parts = points.map((p, i) => {
    const { x, y } = project(p, view, size);
    return `${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`;
  });
  return parts.length > 0 ? `${parts.join('')}${close ? 'Z' : ''}` : '';
}

/** The travelled part of a route and the current position, for `progress` in [0, 1]. */
export function routeProgress(route: MapRoute): { travelled: LngLat[]; at: LngLat | null } {
  if (route.stops.length === 0) return { travelled: [], at: null };
  const progress = Math.min(1, Math.max(0, route.progress ?? 0));
  const target = routeLength(route.stops) * progress;
  const at = pointAlong(route.stops, target);
  const travelled: LngLat[] = [route.stops[0] as LngLat];
  let walked = 0;
  for (let i = 1; i < route.stops.length; i++) {
    walked += routeLength([route.stops[i - 1] as LngLat, route.stops[i] as LngLat]);
    if (walked > target) break;
    travelled.push(route.stops[i] as LngLat);
  }
  travelled.push(at);
  return { travelled, at };
}

/** Screen radius of a circle fence (meters → px at its latitude). */
export function circleRadiusPx(
  fence: Extract<Geofence, { shape: 'circle' }>,
  view: MapView
): number {
  const metersPerPx =
    (Math.cos((fence.center[1] * Math.PI) / 180) * 2 * Math.PI * 6_371_008.8) /
    (256 * 2 ** view.zoom);
  return fence.radiusMeters / metersPerPx;
}

/** Why a draft ring cannot be saved, or null. */
export function ringProblem(ring: Ring): string | null {
  if (ring.length < 3) return 'A fence needs at least three corners.';
  for (const [lng, lat] of ring) {
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Longitudes go from -180 to 180.';
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitudes go from -90 to 90.';
  }
  return ringSelfIntersects(ring) ? 'The edges cross each other; reorder the corners.' : null;
}
