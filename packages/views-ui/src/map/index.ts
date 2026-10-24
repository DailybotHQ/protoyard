/**
 * `@protoyard/views-ui/map` — thin SimulatedMap adapter over `@texuli/data/map`.
 */

export {
  circleRadiusPx,
  linePath,
  type MapFence,
  type MapMarker,
  type MapRoute,
  type MapTone,
  type MapViewState,
  type MarkerShape,
  PAN_STEP,
  ringProblem,
  routeProgress,
} from './model.ts';
export { default as SimulatedMap } from './SimulatedMap.svelte';
