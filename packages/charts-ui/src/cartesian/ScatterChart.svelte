<script lang="ts">
import type { Margin } from '@protoyard/charts';
import type { ChartSelection } from '../interaction/model.ts';
import ChartShell from './ChartShell.svelte';
import {
  type CartesianSeries,
  chartFormatters,
  defaultSummary,
  tickFormatter,
  type ValueUnit,
} from './model.ts';
import ScatterPlot from './ScatterPlot.svelte';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  /** Points with optional `size` for bubbles; each series gets its own symbol. */
  series: readonly CartesianSeries[];
  xKind?: 'time' | 'linear';
  unit?: ValueUnit;
  currency?: string;
  /** Bubble radius range in px (default 4…18). */
  radius?: [number, number];
  height?: number;
  margin?: Partial<Margin>;
  xHeader?: string;
  showLegend?: boolean;
  showTable?: boolean;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (selection: ChartSelection) => void;
  hidden?: Set<string>;
};

let {
  title,
  description,
  summary,
  series,
  xKind = 'linear',
  unit = 'number',
  currency,
  radius = [4, 18],
  height = 280,
  margin,
  xHeader,
  showLegend,
  showTable,
  loading,
  error,
  onretry,
  emptyMessage,
  onselect,
  hidden = $bindable(new Set<string>()),
}: Props = $props();

const units = $derived({ unit, ...(currency ? { currency } : {}) });
const formatters = $derived(chartFormatters(xKind, units));
</script>

<ChartShell
  {title}
  {description}
  summary={summary ?? defaultSummary(series, xKind)}
  {height}
  margin={{ left: 48, ...margin }}
  {loading}
  {error}
  {onretry}
  {emptyMessage}
  {series}
  {formatters}
  xHeader={xHeader ?? (xKind === 'time' ? 'Date' : 'X')}
  {showLegend}
  {showTable}
  bind:hidden
>
  {#snippet plot(size)}
    <ScatterPlot label={title} {series} {hidden} {xKind} {...size} {formatters} tickFormat={tickFormatter(units)} {radius} {onselect} />
  {/snippet}
</ChartShell>
