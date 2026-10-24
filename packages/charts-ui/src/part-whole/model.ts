/** Part-whole helpers kept for analytics/groupSmallSlices consumers. */
export interface Slice {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface GroupedSlice extends Slice {
  members?: string[];
}

export interface FunnelChartStep {
  id: string;
  label: string;
  value?: number;
  count?: number;
}

export function formatShare(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '—';
  return `${Math.round((value / total) * 1000) / 10}%`;
}

export function groupSmallSlices(slices: readonly Slice[], threshold = 0.02): GroupedSlice[] {
  const total = slices.reduce((s, x) => s + (Number.isFinite(x.value) ? x.value : 0), 0);
  if (total <= 0) return [...slices];
  const kept: GroupedSlice[] = [];
  const other: Slice[] = [];
  for (const slice of slices) {
    if (slice.value / total < threshold) other.push(slice);
    else kept.push(slice);
  }
  if (other.length === 0) return kept;
  kept.push({
    id: 'other',
    label: 'Other',
    value: other.reduce((s, x) => s + x.value, 0),
    members: other.map((x) => x.id),
  });
  return kept;
}
