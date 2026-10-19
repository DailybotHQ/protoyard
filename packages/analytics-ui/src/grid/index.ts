// @protoyard/analytics-ui/grid — keyboard-editable dashboard grid and widget cards.
import type { AnalyticsView } from '../views.ts';

export const VIEW = 'grid' satisfies AnalyticsView;

export {
  compactLayout,
  type DashboardLayout,
  DashboardLayoutSchema,
  type DashboardWidget,
  DashboardWidgetSchema,
  GRID_COLUMNS,
  type MoveDirection,
  moveWidget,
  readingOrder,
  resizeWidget,
} from '@protoyard/analytics';
export { default as DashboardGrid } from './DashboardGrid.svelte';
export { default as WidgetCard } from './WidgetCard.svelte';
