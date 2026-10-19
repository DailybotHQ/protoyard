import { type Bbox, inverseMercator, type LngLat, mercator } from './geo.ts';

export interface MapPoint extends LngLat {
  id: string;
}

export type ClusterItem<T extends MapPoint> =
  | { kind: 'point'; point: T }
  | {
      kind: 'cluster';
      /** Stable for a zoom and cell: `cluster:<zoom>:<cx>:<cy>`. */
      id: string;
      /** Mean position of the members (in Mercator space). */
      center: LngLat;
      count: number;
      /** Member ids, sorted. */
      ids: string[];
      /** Box of the members, for "zoom to cluster" (`fitBounds`). */
      bbox: Bbox;
    };

/**
 * Buckets points into `cellPx` squares of the zoom's world grid (not the
 * screen), so clusters do not jump while panning. Cells with one point stay
 * points. Deterministic: points are sorted by id first, and items come out in
 * grid order (rows, then columns), then by id.
 */
export function cluster<T extends MapPoint>(
  points: readonly T[],
  zoom: number,
  cellPx = 64
): ClusterItem<T>[] {
  const z = Math.floor(zoom);
  const world = 256 * 2 ** z;
  const cell = Math.max(1, cellPx);
  const sorted = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cells = new Map<string, { cx: number; cy: number; members: T[]; x: number; y: number }>();
  for (const point of sorted) {
    const m = mercator(point);
    const cx = Math.floor((m.x * world) / cell);
    const cy = Math.floor((m.y * world) / cell);
    const key = `${cx}:${cy}`;
    const bucket = cells.get(key);
    if (bucket) {
      bucket.members.push(point);
      bucket.x += m.x;
      bucket.y += m.y;
    } else {
      cells.set(key, { cx, cy, members: [point], x: m.x, y: m.y });
    }
  }
  return [...cells.values()]
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx)
    .map((bucket): ClusterItem<T> => {
      if (bucket.members.length === 1) return { kind: 'point', point: bucket.members[0] as T };
      let minLng = Number.POSITIVE_INFINITY;
      let minLat = Number.POSITIVE_INFINITY;
      let maxLng = Number.NEGATIVE_INFINITY;
      let maxLat = Number.NEGATIVE_INFINITY;
      for (const p of bucket.members) {
        minLng = Math.min(minLng, p.lng);
        minLat = Math.min(minLat, p.lat);
        maxLng = Math.max(maxLng, p.lng);
        maxLat = Math.max(maxLat, p.lat);
      }
      const n = bucket.members.length;
      return {
        kind: 'cluster',
        id: `cluster:${z}:${bucket.cx}:${bucket.cy}`,
        center: inverseMercator(bucket.x / n, bucket.y / n),
        count: n,
        ids: bucket.members.map((p) => p.id),
        bbox: [minLng, minLat, maxLng, maxLat],
      };
    });
}
