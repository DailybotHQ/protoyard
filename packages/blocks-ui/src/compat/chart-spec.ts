/**
 * Map Protoyard AI ChartSpec (labels × series.values) to Texuli chart block
 * shape (series[].points[{x,y}]) for `@texuli/blocks/data` ChartBlockView.
 */
import type { ChartBlock as ProtoyardChart } from '@protoyard/blocks';
import { ChartSpecSchema } from '@protoyard/blocks';

export type TexuliChartKind =
  | 'line'
  | 'area'
  | 'bar'
  | 'stacked-bar'
  | 'heatmap'
  | 'scatter'
  | 'bubble';

const KIND_MAP: Record<string, TexuliChartKind> = {
  line: 'line',
  area: 'area',
  bar: 'bar',
  stacked: 'stacked-bar',
  'stacked-bar': 'stacked-bar',
  column: 'bar',
  donut: 'bar',
  pie: 'bar',
  funnel: 'bar',
};

export type TexuliChartBlock = {
  type: 'chart';
  id?: string;
  kind: TexuliChartKind;
  title: string;
  description: string;
  series: Array<{
    id: string;
    label: string;
    points: Array<{ x: string | number; y: number | null }>;
  }>;
};

/** Convert a validated Protoyard chart block, or null when the spec is invalid. */
export function toTexuliChartBlock(block: ProtoyardChart): TexuliChartBlock | null {
  const parsed = ChartSpecSchema.safeParse(block.spec);
  if (!parsed.success) return null;
  const spec = parsed.data;
  const kind = KIND_MAP[spec.kind] ?? 'bar';
  const labels = spec.labels ?? [];
  return {
    type: 'chart',
    id: block.id,
    kind,
    title: spec.title,
    description:
      typeof spec.description === 'string' && spec.description ? spec.description : spec.title,
    series: (spec.series ?? []).map((row, index) => ({
      id: `s${index}`,
      label: row.label,
      points: labels.map((label, i) => ({
        x: label,
        y: row.values[i] ?? null,
      })),
    })),
  };
}
