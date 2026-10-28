/*
 * Trend semantics shared by StatCard and analytics KPI tiles, so every
 * metric reads the same. `resolveTrend`, `trendWord` and `formatDelta` are
 * Texuli's (`texuli/stat`); `trendTone` stays here because it returns
 * Protoyard's Tailwind text classes.
 */
import type { Trend } from 'texuli/stat';

export { formatDelta, resolveTrend, type Trend, trendWord } from 'texuli/stat';

/** Text color class: success when the trend goes the good way (`positive`), destructive otherwise. */
export function trendTone(trend: Trend, positive: 'up' | 'down' = 'up'): string {
  return trend === 'neutral'
    ? 'text-muted-foreground'
    : trend === positive
      ? 'text-success'
      : 'text-destructive';
}
