/*
 * Trend semantics shared by StatCard and analytics KPI tiles, so every
 * metric reads the same: direction from the delta, tone from whether that
 * direction is good, and the word screen readers hear.
 */

export type Trend = 'up' | 'down' | 'neutral';

/** The explicit trend, else the sign of a numeric delta (text deltas are neutral). */
export function resolveTrend(delta?: string | number | null, trend?: Trend): Trend {
  if (trend) return trend;
  return typeof delta === 'number'
    ? delta > 0
      ? 'up'
      : delta < 0
        ? 'down'
        : 'neutral'
    : 'neutral';
}

/** Text color class: success when the trend goes the good way (`positive`), destructive otherwise. */
export function trendTone(trend: Trend, positive: 'up' | 'down' = 'up'): string {
  return trend === 'neutral'
    ? 'text-muted-foreground'
    : trend === positive
      ? 'text-success'
      : 'text-destructive';
}

/** The word read before the delta: "Increased", "Decreased" or "No change". */
export function trendWord(trend: Trend): string {
  return trend === 'up' ? 'Increased' : trend === 'down' ? 'Decreased' : 'No change';
}

/** A numeric delta with its sign (`+12`); text passes through. */
export function formatDelta(delta: string | number | undefined): string | undefined {
  return typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta.toLocaleString()}` : delta;
}
