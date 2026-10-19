import { z } from 'zod';
import { type Bbox, type MapSize, type MapView, project, viewBounds } from './geo.ts';

/**
 * A basemap is plain data: features with flat `[lng, lat, lng, lat, …]`
 * coordinate arrays. Prototypes can pass their own (validated here) for other
 * fictional places. Rendering produces SVG path `d` strings built only from
 * numbers, so a basemap from data can never inject markup.
 */

export const BASEMAP_KINDS = ['land', 'water', 'park', 'district', 'road', 'rail'] as const;
export type BasemapKind = (typeof BASEMAP_KINDS)[number];

const coords = (minPairs: number) =>
  z
    .array(z.number())
    .min(minPairs * 2)
    .max(20_000)
    .superRefine((values, ctx) => {
      if (values.length % 2 !== 0)
        ctx.addIssue({ code: 'custom', message: 'coordinates come in [lng, lat] pairs' });
      for (let i = 0; i < values.length; i += 2) {
        const lng = values[i] as number;
        const lat = values[i + 1] as number;
        if (!(Math.abs(lng) <= 180 && Math.abs(lat) <= 85.06)) {
          ctx.addIssue({ code: 'custom', path: [i], message: `pair ${i / 2} is outside the map` });
          return;
        }
      }
    });

const base = {
  id: z.string().min(1).max(64),
  kind: z.enum(BASEMAP_KINDS),
  name: z.string().min(1).max(80).optional(),
  /** Where to place the name, as `[lng, lat]` (polygons default to their first vertex). */
  label: z.tuple([z.number(), z.number()]).optional(),
};

export const BasemapFeatureSchema = z.discriminatedUnion('geometry', [
  z.strictObject({ ...base, geometry: z.literal('polygon'), coords: coords(3) }),
  z.strictObject({ ...base, geometry: z.literal('line'), coords: coords(2) }),
]);
export type BasemapFeature = z.infer<typeof BasemapFeatureSchema>;

export const BasemapSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  /** `[minLng, minLat, maxLng, maxLat]`: what "fit the map" shows. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** Always shown on the map; say that the place is fictional. */
  attribution: z.string().min(1).max(120),
  features: z.array(BasemapFeatureSchema).max(2000),
});
export type Basemap = z.infer<typeof BasemapSchema>;

export interface BasemapPath {
  id: string;
  kind: BasemapKind;
  name?: string;
  closed: boolean;
  /** SVG path data in screen px (numbers and M/L/Z only). */
  d: string;
  label?: { x: number; y: number; text: string };
}

function featureBox(values: readonly number[]): Bbox {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 2) {
    minLng = Math.min(minLng, values[i] as number);
    maxLng = Math.max(maxLng, values[i] as number);
    minLat = Math.min(minLat, values[i + 1] as number);
    maxLat = Math.max(maxLat, values[i + 1] as number);
  }
  return [minLng, minLat, maxLng, maxLat];
}

function overlaps(a: Bbox, b: Bbox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Screen paths for the features that overlap the view, in basemap order
 * (land first, roads last, as authored). Labels are placed at `label` or the
 * first vertex.
 */
export function basemapPaths(basemap: Basemap, view: MapView, size: MapSize): BasemapPath[] {
  const visible = viewBounds(view, size);
  const paths: BasemapPath[] = [];
  for (const feature of basemap.features) {
    if (!overlaps(featureBox(feature.coords), visible)) continue;
    const parts: string[] = [];
    for (let i = 0; i < feature.coords.length; i += 2) {
      const p = project(
        { lng: feature.coords[i] as number, lat: feature.coords[i + 1] as number },
        view,
        size
      );
      parts.push(`${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`);
    }
    const closed = feature.geometry === 'polygon';
    const path: BasemapPath = {
      id: feature.id,
      kind: feature.kind,
      closed,
      d: parts.join('') + (closed ? 'Z' : ''),
    };
    if (feature.name) {
      path.name = feature.name;
      const [lng, lat] = feature.label ?? [
        feature.coords[0] as number,
        feature.coords[1] as number,
      ];
      const at = project({ lng, lat }, view, size);
      path.label = { x: round(at.x), y: round(at.y), text: feature.name };
    }
    paths.push(path);
  }
  return paths;
}
