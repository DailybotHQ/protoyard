<script lang="ts">
import type { Margin } from '@protoyard/charts';
import type { ChartSelection } from '../interaction/model.ts';
import BarPlot from './BarPlot.svelte';
import ChartShell from './ChartShell.svelte';
import {
  type BarMode,
  type CartesianSeries,
  chartFormatters,
  defaultSummary,
  tickFormatter,
  type ValueUnit,
  type XKind,
} from './model.ts';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  series: readonly CartesianSeries[];
  /** How x values are labelled: `time` formats dates, `category` prints names. */
  xKind?: XKind;
  orientation?: 'vertical' | 'horizontal';
  /** `grouped` side by side, `stacked` on top (negatives below zero), `expanded` as shares of 100 %. */
  mode?: BarMode;
  unit?: ValueUnit;
  currency?: string;
  /** Print each bar's value (grouped bars only). */
  showValues?: boolean;
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
  xKind = 'category',
  orientation = 'vertical',
  mode = 'grouped',
  unit = 'number',
  currency,
  showValues = false,
  height = 260,
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
const formatters = $derived(chartFormatters(xKind === 'linear' ? 'category' : xKind, units));
const tickFormat = $derived(tickFormatter(units));
</script>

<ChartShell
  {title}
  {description}
  summary={summary ?? defaultSummary(series, xKind)}
  {height}
  margin={orientation === 'horizontal' ? { left: 96, ...margin } : { left: 48, ...margin }}
  {loading}
  {error}
  {onretry}
  {emptyMessage}
  {series}
  {formatters}
  xHeader={xHeader ?? (xKind === 'time' ? 'Date' : 'Category')}
  {showLegend}
  {showTable}
  bind:hidden
>
  {#snippet plot(size)}
    <BarPlot label={title} {series} {hidden} {orientation} {mode} {...size} {formatters} {tickFormat} {showValues} {onselect} />
  {/snippet}
</ChartShell>
