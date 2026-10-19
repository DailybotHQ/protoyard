<script lang="ts">
import type { Margin } from '@protoyard/charts';
import type { Curve } from '@protoyard/charts/shapes';
import type { ChartSelection } from '../interaction/model.ts';
import ChartShell from './ChartShell.svelte';
import LinePlot from './LinePlot.svelte';
import {
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
  xKind?: XKind;
  unit?: ValueUnit;
  currency?: string;
  /** Fill under each line. */
  area?: boolean;
  /** Stack areas on top of each other (implies `area`). */
  stacked?: boolean;
  curve?: Curve;
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
  /** Series hidden through the legend (bindable). */
  hidden?: Set<string>;
};

let {
  title,
  description,
  summary,
  series,
  xKind = 'time',
  unit = 'number',
  currency,
  area = false,
  stacked = false,
  curve = 'monotone-x',
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
const formatters = $derived(chartFormatters(xKind, units));
const tickFormat = $derived(tickFormatter(units));
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
  xHeader={xHeader ?? (xKind === 'time' ? 'Date' : 'Category')}
  {showLegend}
  {showTable}
  bind:hidden
>
  {#snippet plot(size)}
    <LinePlot
      label={title}
      {series}
      {hidden}
      {xKind}
      {...size}
      {formatters}
      {tickFormat}
      {curve}
      area={area || stacked}
      {stacked}
      {onselect}
    />
  {/snippet}
</ChartShell>
