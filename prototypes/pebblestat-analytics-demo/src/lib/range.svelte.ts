import {
  comparisonRange,
  type DateRange,
  type Granularity,
  resolveDateRange,
} from '@protoyard/analytics';
import { type DateRangeValue, DEFAULT_DATE_RANGE } from '@protoyard/analytics-ui/date-range';

/**
 * The date range every analytics screen shares (presentation state, not data):
 * pick "Last 7 days" on Trends and Funnels shows the same week.
 */
const state = $state<{ value: DateRangeValue }>({ value: DEFAULT_DATE_RANGE });

export const sharedRange = {
  get value(): DateRangeValue {
    return state.value;
  },
  set(value: DateRangeValue) {
    state.value = value;
  },
};

export interface ResolvedRange {
  range: DateRange;
  previous: DateRange | null;
  granularity: Granularity;
}

/** The current range against the SIMULATED now (never Date.now()). */
export function resolveRange(value: DateRangeValue, now: Date): ResolvedRange {
  const range = resolveDateRange(value.range, now);
  return {
    range,
    previous: comparisonRange(range, value.comparison),
    granularity: value.granularity,
  };
}
