/**
 * `@protoyard/views-ui/map` — host `SimulatedMap` (routes, fences, clusters) on
 * the `@protoyard/views/map` engine (Texuli), plus a re-export of Texuli's
 * `MapView` for the markers-only API.
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
/** Texuli map view — import from `@texuli/data/map` directly when the markers-only API is enough. */
