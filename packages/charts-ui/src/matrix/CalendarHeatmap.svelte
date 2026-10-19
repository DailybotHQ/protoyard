<script lang="ts">
import { type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import type { PlotSeries } from '../interaction/model.ts';
import CalendarPlot from './CalendarPlot.svelte';
import MatrixFrame from './MatrixFrame.svelte';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  /** First and last day (`YYYY-MM-DD`, inclusive, UTC). */
  start: string;
  end: string;
  /** Values by day; days not listed are "no data", drawn differently from 0. */
  values: Readonly<Record<string, number>>;
  unit?: ValueUnit;
  /** 0 = Sunday … 6 = Saturday (default 1, Monday). */
  weekStartsOn?: number;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (day: { date: string; value: number | null }) => void;
};

let {
  title,
  description,
  summary,
  start,
  end,
  values,
  unit = 'number',
  weekStartsOn = 1,
  height = 160,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const format = $derived(valueFormatter({ unit }));
const entries = $derived(
  Object.entries(values).filter(([d, v]) => d >= start && d <= end && Number.isFinite(v))
);
const max = $derived(entries.length ? Math.max(...entries.map(([, v]) => v)) : 0);
const total = $derived(entries.reduce((s, [, v]) => s + v, 0));
const text = $derived(
  summary ??
    `${title}: ${format(total)} in total over ${entries.length} days with data, up to ${format(max)} on one day.`
);
const tableSeries = $derived<PlotSeries[]>([
  {
    id: 'value',
    label: 'Value',
    points: entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({ x: 0, y: 0, xValue: d, yValue: v })),
  },
]);
</script>

<MatrixFrame
  {title}
  {description}
  summary={text}
  {height}
  {loading}
  {error}
  {onretry}
  empty={!loading && !error && entries.length === 0 ? (emptyMessage ?? true) : false}
  {tableSeries}
  formatters={{ x: (v) => String(v), y: (v) => format(v) }}
  xHeader="Date"
  ramp={{ min: 0, max, format: (v) => format(v), emptyLabel: 'No data' }}
>
  {#snippet plot(size)}
    <CalendarPlot label={title} {start} {end} {values} {weekStartsOn} width={size.width} height={size.height} {format} {onselect} />
  {/snippet}
</MatrixFrame>
