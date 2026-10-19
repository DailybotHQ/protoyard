<script lang="ts">
import type { Margin } from '@protoyard/charts';
import type { ChartSelection } from '../interaction/model.ts';
import ChartShell from './ChartShell.svelte';
import ComboPlot from './ComboPlot.svelte';
import {
  type CartesianSeries,
  chartFormatters,
  comboRoles,
  defaultSummary,
  tickFormatter,
  type ValueUnit,
  valueFormatter,
  type XKind,
} from './model.ts';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  /** Bars on the left axis and lines on the right (see `type` / `axis` on each series). */
  series: readonly CartesianSeries[];
  xKind?: XKind;
  leftUnit?: ValueUnit;
  rightUnit?: ValueUnit;
  currency?: string;
  height?: number;
  margin?: Partial<Margin>;
  xHeader?: string;
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
  leftUnit = 'number',
  rightUnit = 'number',
  currency,
  height = 260,
  margin,
  xHeader,
  showTable,
  loading,
  error,
  onretry,
  emptyMessage,
  onselect,
  hidden = $bindable(new Set<string>()),
}: Props = $props();

const roles = $derived(comboRoles(series));
const unitOf = (id: string) => (roles.get(id)?.axis === 'right' ? rightUnit : leftUnit);
const base = $derived(chartFormatters(xKind === 'linear' ? 'category' : xKind, { unit: leftUnit }));
// Each series keeps its own axis' unit in the tooltip and the table.
const formatters = $derived({
  x: base.x,
  y: (v: number | null, id: string) =>
    valueFormatter({ unit: unitOf(id), ...(currency ? { currency } : {}) })(v),
});
const legendLabels = $derived(
  Object.fromEntries(
    series.map((s) => [
      s.id,
      `${s.label} (${roles.get(s.id)?.axis === 'right' ? 'right' : 'left'} axis)`,
    ])
  )
);
</script>

<ChartShell
  {title}
  {description}
  summary={summary ?? defaultSummary(series, xKind)}
  {height}
  margin={{ left: 48, right: 48, ...margin }}
  {loading}
  {error}
  {onretry}
  {emptyMessage}
  {series}
  {formatters}
  xHeader={xHeader ?? (xKind === 'time' ? 'Date' : 'Category')}
  {legendLabels}
  {showTable}
  bind:hidden
>
  {#snippet plot(size)}
    <ComboPlot
      label={title}
      {series}
      {hidden}
      {...size}
      {formatters}
      leftFormat={tickFormatter({ unit: leftUnit, ...(currency ? { currency } : {}) })}
      rightFormat={tickFormatter({ unit: rightUnit, ...(currency ? { currency } : {}) })}
      {onselect}
    />
  {/snippet}
</ChartShell>
