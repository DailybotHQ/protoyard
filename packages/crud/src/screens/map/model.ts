import type { BlueprintEntity, BlueprintField, BlueprintScreen } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import type { Bbox } from '@protoyard/views/map';
import type { MapMarker, MapTone, MarkerShape } from '@protoyard/views-ui/map';

/** Rows → map markers for a blueprint `map` screen. */

export type MapScreenSpec = Extract<BlueprintScreen, { type: 'map' }>;

/** Above this many markers the map clusters nearby ones. */
export const CLUSTER_ABOVE = 200;
export const clusterCellSize = (markerCount: number): number =>
  markerCount > CLUSTER_ABOVE ? 56 : 1;

const TONES: readonly MapTone[] = ['primary', 'info', 'success', 'warning', 'danger', 'neutral'];
const SHAPES: readonly MarkerShape[] = ['circle', 'square', 'diamond', 'triangle'];

/** Tone, shape and glyph for an enum value, in declared order, so color is never the only signal. */
export function styleFor(
  field: BlueprintField | undefined,
  value: unknown
): { tone: MapTone; shape: MarkerShape; glyph: string; label: string } {
  if (field?.kind !== 'enum') return { tone: 'primary', shape: 'circle', glyph: '', label: '' };
  const index = field.values.indexOf(String(value));
  if (index < 0) return { tone: 'neutral', shape: 'circle', glyph: '?', label: 'Unknown' };
  const text = field.values[index] as string;
  return {
    tone: TONES[index % TONES.length] as MapTone,
    shape: SHAPES[index % SHAPES.length] as MarkerShape,
    glyph: text.charAt(0).toUpperCase(),
    label: field.labels?.[text] ?? text,
  };
}

/** A stored geo value (`{ lat, lng }` in range), or null. */
export function readPoint(value: unknown): { lng: number; lat: number } | null {
  if (!value || typeof value !== 'object') return null;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lng, lat };
}

export function rowsToMarkers(
  rows: readonly Row[],
  entity: BlueprintEntity,
  screen: MapScreenSpec
): MapMarker[] {
  const colorField = entity.fields.find((f) => f.name === screen.colorBy);
  return rows.flatMap((row) => {
    const point = readPoint(row[screen.geoField]);
    if (!point) return [];
    const style = styleFor(colorField, screen.colorBy ? row[screen.colorBy] : undefined);
    const title = String(row[entity.titleField] ?? '').trim() || 'Untitled';
    return [
      {
        id: String(row.id),
        label: title,
        ...(style.label ? { detail: style.label } : {}),
        ...point,
        tone: style.tone,
        shape: style.shape,
        ...(style.glyph ? { glyph: style.glyph } : {}),
      },
    ];
  });
}

/** The box around the markers (padded a little), or null without markers. */
export function markersBbox(markers: readonly { lng: number; lat: number }[]): Bbox | null {
  if (markers.length === 0) return null;
  let [minLng, minLat, maxLng, maxLat] = [180, 90, -180, -90];
  for (const m of markers) {
    minLng = Math.min(minLng, m.lng);
    minLat = Math.min(minLat, m.lat);
    maxLng = Math.max(maxLng, m.lng);
    maxLat = Math.max(maxLat, m.lat);
  }
  const pad = Math.max(0.005, (maxLng - minLng) * 0.05, (maxLat - minLat) * 0.05);
  return [minLng - pad, minLat - pad, maxLng + pad, maxLat + pad];
}
