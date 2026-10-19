/**
 * `@protoyard/views/map` — an offline, simulated map engine: a fictional
 * basemap as data (Port Meridian, or your own validated one), Web Mercator
 * views, clustering, geofences, distances, routes and nearest points. No
 * tiles, no network, no geocoding, no real geography.
 * `@protoyard/views-ui/map` renders it.
 */
export {
  BASEMAP_KINDS,
  type Basemap,
  type BasemapFeature,
  BasemapFeatureSchema,
  type BasemapKind,
  type BasemapPath,
  BasemapSchema,
  basemapPaths,
} from './basemap.ts';
export { type ClusterItem, cluster, type MapPoint } from './cluster.ts';
export {
  type FenceEvent,
  fencesAt,
  fenceTransitions,
  type Geofence,
  GeofenceSchema,
  insideFence,
  pointInRing,
  type Ring,
  RingSchema,
  ringContains,
  ringSelfIntersects,
  type TrackPoint,
} from './fence.ts';
export {
  type Bbox,
  clampZoom,
  etaSeconds,
  fitBounds,
  haversine,
  inverseMercator,
  type LngLat,
  MAX_ZOOM,
  type MapSize,
  type MapView,
  MIN_ZOOM,
  mercator,
  nearest,
  panBy,
  pointAlong,
  project,
  routeLength,
  unproject,
  viewBounds,
  zoomAround,
} from './geo.ts';
export { PORT_MERIDIAN } from './port-meridian.ts';
