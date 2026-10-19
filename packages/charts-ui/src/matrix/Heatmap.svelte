<script lang="ts">
import { type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import type { PlotSeries } from '../interaction/model.ts';
import HeatmapPlot from './HeatmapPlot.svelte';
import MatrixFrame from './MatrixFrame.svelte';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  /** Row labels (e.g. weekdays) and column labels (e.g. hours). */
  rows: readonly string[];
  cols: readonly string[];
  /** `values[row][col]`; null is "no data" (drawn dashed, distinct from 0). */
  values: readonly (readonly (number | null)[])[];
  unit?: ValueUnit;
  currency?: string;
  /** Use the diverging ramp around `mid` (e.g. changes around 0). */
  diverging?: boolean;
  mid?: number;
  /** Print values in cells when they fit and their text reaches 4.5:1 (default true). */
  showValues?: boolean;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (cell: { row: number; col: number; value: number | null }) => void;
};

let {
  title,
  description,
  summary,
  rows,
  cols,
  values,
  unit = 'number',
  currency,
  diverging = false,
  mid = 0,
  showValues = true,
  height = 260,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const format = $derived(valueFormatter({ unit, ...(currency ? { currency } : {}) }));
const finite = $derived(values.flat().filter((v): v is number => v !== null && Number.isFinite(v)));
const min = $derived(finite.length ? Math.min(...finite) : 0);
const max = $derived(finite.length ? Math.max(...finite) : 0);
const peak = $derived.by(() => {
  for (let r = 0; r < values.length; r++) {
    const c = (values[r] ?? []).indexOf(max);
    if (c >= 0 && finite.length) return { r, c };
  }
  return null;
});
const text = $derived(
  summary ??
    `${title}: ${rows.length} × ${cols.length} cells from ${format(min)} to ${format(max)}${peak ? `, highest at ${rows[peak.r]}, ${cols[peak.c]}` : ''}.`
);
// Table: one row per heatmap row, one column per heatmap column.
const tableSeries = $derived<PlotSeries[]>(
  cols.map((col, c) => ({
    id: `c${c}`,
    label: col,
    points: rows.map((row, r) => ({ x: 0, y: 0, xValue: row, yValue: values[r]?.[c] ?? null })),
  }))
);
</script>

<MatrixFrame
  {title}
  {description}
  summary={text}
  {height}
  {loading}
  {error}
  {onretry}
  empty={!loading && !error && finite.length === 0 ? (emptyMessage ?? true) : false}
  {tableSeries}
  formatters={{ x: (v) => String(v), y: (v) => format(v) }}
  xHeader=""
  ramp={{ min, max, format: (v) => format(v), diverging, emptyLabel: values.flat().some((v) => v === null) ? 'No data' : undefined }}
>
  {#snippet plot(size)}
    <HeatmapPlot label={title} {rows} {cols} {values} width={size.width} height={size.height} {format} {diverging} {mid} {showValues} {onselect} />
  {/snippet}
</MatrixFrame>
