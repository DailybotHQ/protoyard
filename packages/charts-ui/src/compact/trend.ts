/*
 * Text equivalents for compact charts: a sparkline is announced as one
 * sentence ("Trend: up 12% over 30 days") instead of point-by-point.
 */

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export interface TrendSummary {
  direction: 'up' | 'down' | 'flat' | 'none';
  /** (last − first) / |first|; null when first is 0 or there are fewer than two values. */
  change: number | null;
  first: number | null;
  last: number | null;
}

export function trendSummary(values: readonly (number | null)[]): TrendSummary {
  const defined = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const first = defined[0] ?? null;
  const last = defined.at(-1) ?? null;
  if (first === null || last === null || defined.length < 2)
    return { direction: 'none', change: null, first, last };
  const direction = last > first ? 'up' : last < first ? 'down' : 'flat';
  return { direction, change: first === 0 ? null : (last - first) / Math.abs(first), first, last };
}

/** "Trend: up 12% over 30 days", "Trend: flat over 30 days", "No trend data". */
export function trendLabel(
  values: readonly (number | null)[],
  period?: string,
  format: (value: number) => string = String
): string {
  const t = trendSummary(values);
  const over = period ? ` over ${period}` : '';
  if (t.direction === 'none') return 'No trend data';
  if (t.direction === 'flat') return `Trend: flat${over}`;
  if (t.change === null)
    return `Trend: ${t.direction} from ${format(t.first as number)} to ${format(t.last as number)}${over}`;
  return `Trend: ${t.direction} ${percent.format(Math.abs(t.change))}${over}`;
}
