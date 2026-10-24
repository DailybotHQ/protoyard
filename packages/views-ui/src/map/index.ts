/**
 * `@protoyard/views-ui/map` — thin SimulatedMap adapter over `@texuli/data/map`.
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
