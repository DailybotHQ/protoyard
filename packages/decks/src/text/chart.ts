import type { ChartSpec } from '@protoyard/blocks';
import { escapeInline, table } from './escape.ts';

function number(value: number | null): string {
  if (value === null) return '';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

/**
 * A chart as a caption and a data table (one row per label, one column per
 * series): the accessible twin of the rendered chart.
 */
export function chartTable(spec: ChartSpec): string {
  const caption = `*Chart (${escapeInline(spec.kind)}): ${escapeInline(spec.title)}*`;
  const description = spec.description ? escapeInline(spec.description) : '';
  const unit =
    spec.unit && spec.unit !== 'number'
      ? `*Unit: ${escapeInline(spec.currency ? `${spec.unit} ${spec.currency}` : spec.unit)}*`
      : '';
  const rows = spec.labels.map((label, i) => [
    label,
    ...spec.series.map((s) => number(s.values[i] ?? null)),
  ]);
  return [caption, description, unit, table(['', ...spec.series.map((s) => s.label)], rows)]
    .filter(Boolean)
    .join('\n\n');
}
