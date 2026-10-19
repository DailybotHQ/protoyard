import type { Basemap } from './basemap.ts';

/**
 * Port Meridian: a fictional coastal city, hand-drawn as data. Its box is the
 * `harbor-bay` region of `@protoyard/scenarios` geo (open South Atlantic, far
 * from any real coast), and its districts sit on that region's anchors (North
 * Pier, Old Mill, Lantern Point), so `geoPoints({ region: 'harbor-bay' })`
 * lands on this map. Coordinates are `[lng, lat]` pairs; nothing here is a
 * real place.
 */
export const PORT_MERIDIAN: Basemap = {
  id: 'port-meridian',
  name: 'Port Meridian',
  bbox: [-20, -32, -17, -30],
  attribution: 'Simulated map · Port Meridian is fictional, not real geography',
  features: [
    {
      id: 'mainland',
      kind: 'land',
      geometry: 'polygon',
      coords: [
        -20, -30, -18.9, -30, -18.5, -30.15, -18.3, -30.35, -18.45, -30.55, -18.7, -30.62, -18.78,
        -30.85, -18.55, -31, -18.2, -31.15, -17.95, -31.35, -17.6, -31.48, -17.52, -31.7, -17.9,
        -31.82, -18.4, -31.76, -18.9, -31.9, -19.4, -32, -20, -32,
      ],
    },
    {
      id: 'gull-island',
      kind: 'land',
      name: 'Gull Island',
      geometry: 'polygon',
      coords: [-17.45, -30.55, -17.3, -30.5, -17.22, -30.62, -17.38, -30.73],
      label: [-17.35, -30.62],
    },
    {
      id: 'mill-lake',
      kind: 'water',
      name: 'Mill Lake',
      geometry: 'polygon',
      coords: [-19.9, -31.55, -19.65, -31.5, -19.55, -31.65, -19.7, -31.78, -19.92, -31.7],
      label: [-19.74, -31.64],
    },
    {
      id: 'meridian-river',
      kind: 'water',
      name: 'Meridian River',
      geometry: 'line',
      coords: [
        -20, -31.4, -19.75, -31.32, -19.55, -31.18, -19.35, -31.02, -19.15, -30.95, -18.95, -30.9,
        -18.78, -30.85,
      ],
      label: [-19.55, -31.18],
    },
    {
      id: 'highland-park',
      kind: 'park',
      name: 'Highland Park',
      geometry: 'polygon',
      coords: [-19.85, -30.3, -19.55, -30.28, -19.5, -30.45, -19.8, -30.52],
      label: [-19.68, -30.4],
    },
    {
      id: 'lantern-dunes',
      kind: 'park',
      name: 'Lantern Dunes',
      geometry: 'polygon',
      coords: [-18.25, -31.5, -18.05, -31.48, -18.0, -31.62, -18.22, -31.66],
      label: [-18.13, -31.57],
    },
    {
      id: 'north-pier',
      kind: 'district',
      name: 'North Pier',
      geometry: 'polygon',
      coords: [
        -18.85, -30.25, -18.55, -30.2, -18.42, -30.35, -18.52, -30.55, -18.75, -30.58, -18.9,
        -30.45,
      ],
      label: [-18.6, -30.4],
    },
    {
      id: 'meridian-center',
      kind: 'district',
      name: 'Meridian Center',
      geometry: 'polygon',
      coords: [-19.35, -30.55, -18.95, -30.6, -18.82, -30.8, -19.1, -30.88, -19.38, -30.76],
      label: [-19.1, -30.72],
    },
    {
      id: 'old-mill',
      kind: 'district',
      name: 'Old Mill',
      geometry: 'polygon',
      coords: [-19.45, -30.98, -19.0, -30.93, -18.85, -31.1, -19.0, -31.3, -19.4, -31.3],
      label: [-19.2, -31.1],
    },
    {
      id: 'lantern-point',
      kind: 'district',
      name: 'Lantern Point',
      geometry: 'polygon',
      coords: [-17.98, -31.45, -17.68, -31.45, -17.58, -31.6, -17.7, -31.75, -17.95, -31.74],
      label: [-17.8, -31.6],
    },
    {
      id: 'coast-road',
      kind: 'road',
      name: 'Coast Road',
      geometry: 'line',
      coords: [
        -18.85, -30.1, -18.6, -30.4, -18.88, -30.72, -18.62, -31.02, -18.05, -31.33, -17.8, -31.6,
      ],
    },
    {
      id: 'meridian-avenue',
      kind: 'road',
      name: 'Meridian Avenue',
      geometry: 'line',
      coords: [-19.95, -30.35, -19.6, -30.5, -19.1, -30.72, -18.6, -30.4],
    },
    {
      id: 'mill-road',
      kind: 'road',
      name: 'Mill Road',
      geometry: 'line',
      coords: [-20, -31.12, -19.2, -31.1, -19.1, -30.72],
    },
    {
      id: 'southern-highway',
      kind: 'road',
      name: 'Southern Highway',
      geometry: 'line',
      coords: [-19.2, -31.1, -18.95, -31.42, -18.6, -31.58, -18.2, -31.62, -17.8, -31.6],
    },
    {
      id: 'harbor-line',
      kind: 'rail',
      name: 'Harbor Line',
      geometry: 'line',
      coords: [-19.95, -30.75, -19.45, -30.82, -19.1, -30.72, -18.75, -30.5, -18.6, -30.4],
    },
  ],
};
