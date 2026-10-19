// @protoyard/analytics-ui/filters — filter builder, segment picker and breakdown selector.
import type { AnalyticsView } from '../views.ts';

export const VIEW = 'filters' satisfies AnalyticsView;

export { default as BreakdownSelect } from './BreakdownSelect.svelte';
export { default as FilterBuilder } from './FilterBuilder.svelte';
export { default as FilterGroupEditor } from './FilterGroupEditor.svelte';
export {
  adjustCondition,
  catalogOf,
  describeFilter,
  type FilterProperty,
  type FilterValidation,
  newCondition,
  operatorsFor,
  parseScalar,
  saveErrorOf,
  validateFilter,
} from './model.ts';
export { default as SegmentPicker } from './SegmentPicker.svelte';
