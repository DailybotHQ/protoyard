export type TrendSummary = {
  direction: 'up' | 'down' | 'flat';
  delta: number;
  label: string;
};

export function trendSummary(values: readonly (number | null)[]): TrendSummary {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length < 2) return { direction: 'flat', delta: 0, label: 'No change' };
  const first = finite[0]!;
  const last = finite[finite.length - 1]!;
  const delta = last - first;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return {
    direction,
    delta,
    label: direction === 'flat' ? 'Flat' : direction === 'up' ? 'Up' : 'Down',
  };
}

export function trendLabel(summary: TrendSummary): string {
  return summary.label;
}
