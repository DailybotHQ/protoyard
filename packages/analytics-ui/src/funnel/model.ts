import type { FunnelResult, FunnelStepResult } from '@protoyard/analytics/funnel';

/** The series a funnel view can show: everyone, or one breakdown value. */
export interface FunnelSeries {
  key: string | null;
  label: string;
  steps: FunnelStepResult[];
}

export const ALL_USERS = 'All users';

/** Everyone first, then each breakdown value (largest first, as the engine orders them). */
export function funnelSeries(result: FunnelResult): FunnelSeries[] {
  return [
    { key: null, label: ALL_USERS, steps: result.steps },
    ...(result.breakdown ?? []).map((b) => ({ key: b.key, label: b.key, steps: b.steps })),
  ];
}

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
export const formatConversion = (ratio: number | null) =>
  ratio === null ? '—' : percent.format(ratio);

const one = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
/** Median time to convert in the largest unit that keeps it readable (`45 s`, `12 min`, `3.5 h`, `2.1 days`). */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${one.format(s / 3600)} h`;
  const days = s / 86_400;
  return `${one.format(days)} ${days === 1 ? 'day' : 'days'}`;
}
