/**
 * `@protoyard/crud/screens/map`: the generated map route. A separate entry so
 * the screen, SimulatedMap and the map engine load only with it.
 */
export { default as MapScreen } from './MapScreen.svelte';
export {
  CLUSTER_ABOVE,
  clusterCellSize,
  type MapScreenSpec,
  markersBbox,
  readPoint,
  rowsToMarkers,
  styleFor,
} from './model.ts';
