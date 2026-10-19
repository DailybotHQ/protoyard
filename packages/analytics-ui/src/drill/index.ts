// @protoyard/analytics-ui/drill — from a chart element to its rows, with a breadcrumb.
import type { AnalyticsView } from '../views.ts';

export const VIEW = 'drill' satisfies AnalyticsView;

export { default as DrillDown } from './DrillDown.svelte';
export {
  type DrillPath,
  type DrillStep,
  drillFilter,
  drillStep,
  EMPTY_DRILL,
  fromDrillQuery,
  pushDrill,
  toDrillQuery,
  truncateDrill,
} from './model.ts';
