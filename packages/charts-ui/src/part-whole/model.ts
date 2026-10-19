/*
 * Pure helpers for part-whole charts: grouping small slices into "Other",
 * percentages and the default value formatting.
 */

export interface Slice {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface GroupedSlice extends Slice {
  /** Ids folded into this slice (only on the "Other" slice). */
  members?: string[];
}

/**
 * Folds slices under `threshold` of the total (default 3 %) into one "Other"
 * slice placed last, keeping input order otherwise. Nothing is grouped when
 * only one slice would move (a lone small slice stays itself). Negative and
 * non-finite values count as 0.
 */
export function groupSmallSlices(
  slices: readonly Slice[],
  threshold = 0.03,
  otherLabel = 'Other'
): GroupedSlice[] {
  const clean = slices.map((s) => ({
    ...s,
    value: Number.isFinite(s.value) && s.value > 0 ? s.value : 0,
  }));
  const total = clean.reduce((sum, s) => sum + s.value, 0);
  if (total === 0 || threshold <= 0) return clean;
  const small = clean.filter((s) => s.value / total < threshold);
  if (small.length < 2) return clean;
  const kept = clean.filter((s) => s.value / total >= threshold);
  return [
    ...kept,
    {
      id: '__other',
      label: otherLabel,
      value: small.reduce((sum, s) => sum + s.value, 0),
      color: 'var(--py-muted-foreground)',
      members: small.map((s) => s.id),
    },
  ];
}

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
export const formatShare = (part: number, total: number) =>
  total > 0 ? percent.format(part / total) : '—';

/** One focusable thing in a part-whole chart: a slice, a funnel step, a treemap cell, a node. */
export interface PlotItem {
  id: string;
  /** Spoken and shown in the tooltip: "Pro, 1,240 users, 31%". */
  description: string;
  /** Where the tooltip points, in the plot's pixel space. */
  anchor: { x: number; y: number };
}

/** A funnel step; `count` fits `computeFunnel` results from @protoyard/analytics directly. */
export interface FunnelChartStep {
  id: string;
  label: string;
  value?: number;
  count?: number;
}
