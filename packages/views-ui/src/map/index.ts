/**
 * `@protoyard/views-ui/map` — the simulated map: a fictional SVG basemap,
 * focusable markers and clusters, routes with progress, editable geofences and
 * a synced list. Import this subpath only from a lazy route screen.
 */

export {
  circleRadiusPx,
  linePath,
  type MapMarker,
  type MapRoute,
  type MapTone,
  type MarkerShape,
  PAN_STEP,
  ringProblem,
  routeProgress,
} from './model.ts';
export { default as SimulatedMap } from './SimulatedMap.svelte';
