// @protoyard/analytics-ui/cohort — Cohort retention table.
import type { AnalyticsView } from '../views.ts';

export const VIEW = 'cohort' satisfies AnalyticsView;

export { default as CohortTable } from './CohortTable.svelte';
export {
  type CohortDisplay,
  type CohortPalette,
  cohortLabel,
  formatCount,
  formatRate,
  periodLabel,
  readSequentialRamp,
} from './model.ts';
