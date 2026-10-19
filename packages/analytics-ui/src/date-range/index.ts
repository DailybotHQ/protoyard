// @protoyard/analytics-ui/date-range — date range picker with presets, comparison and granularity.
import type { AnalyticsView } from '../views.ts';

export const VIEW = 'date-range' satisfies AnalyticsView;

export { default as DateRangePanel } from './DateRangePanel.svelte';
export { default as DateRangePicker } from './DateRangePicker.svelte';
export { default as MonthGrid } from './MonthGrid.svelte';
export {
  allowedGranularities,
  COMPARISON_LABELS,
  type DateRangeChange,
  type DateRangeValue,
  DEFAULT_DATE_RANGE,
  defaultGranularity,
  describeDateRange,
  fitGranularity,
  formatSpan,
  fromDateRangeQuery,
  GRANULARITY_LABELS,
  type MonthCell,
  monthGrid,
  rangeLabel,
  toDateRangeQuery,
  weekdayNames,
} from './model.ts';
