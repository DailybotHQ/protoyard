/**
 * Map Protoyard map blocks to Texuli map shapes. Tones pass through; Texuli
 * map draws them via its own toneClass (no views-ui fill table required).
 */
import type { MapBlock } from '@protoyard/blocks';

export function toTexuliMapBlock(block: MapBlock): unknown {
  return {
    type: 'map',
    id: block.id,
    tone: block.tone,
    label: block.label ?? block.title ?? 'Map',
    title: block.title,
    basemap: block.basemap ?? 'port-meridian',
    points: (block.points ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      lng: p.lng,
      lat: p.lat,
      description: p.description,
      tone: p.tone,
    })),
    route: block.route,
  };
}
