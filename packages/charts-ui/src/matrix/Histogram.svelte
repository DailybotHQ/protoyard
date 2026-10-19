<script lang="ts">
import { seriesColor } from '@protoyard/charts/palette';
import { type Bin, type BinOptions, bin } from '@protoyard/charts/shapes';
import ChartShell from '../cartesian/ChartShell.svelte';
import { type CartesianSeries, type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import HistogramPlot from './HistogramPlot.svelte';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  values: readonly (number | null)[];
  /** Bin edges or count (default Sturges, with nice edges). */
  bins?: BinOptions;
  /** Unit of the values being binned (x axis). */
  unit?: ValueUnit;
  currency?: string;
  /** Overlay mean and/or median lines. */
  rules?: readonly ('mean' | 'median')[];
  color?: string;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (bin: Bin) => void;
};

let {
  title,
  description,
  summary,
  values,
  bins: binOptions = {},
  unit = 'number',
  currency,
  rules = [],
  color = seriesColor(0),
  height = 240,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const formatX = $derived(valueFormatter({ unit, ...(currency ? { currency } : {}) }));
const finite = $derived(values.filter((v): v is number => v !== null && Number.isFinite(v)));
const bins = $derived(bin(finite, binOptions));
const stats = $derived.by(() => {
  if (finite.length === 0) return [];
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const mean = finite.reduce((s, v) => s + v, 0) / finite.length;
  return rules.map((kind) => ({ kind, value: kind === 'mean' ? mean : median }));
});
const series = $derived<CartesianSeries<Bin>[]>([
  {
    id: 'count',
    label: 'Count',
    color,
    points: bins.map((b) => ({ x: `${formatX(b.x0)}–${formatX(b.x1)}`, y: b.count, datum: b })),
  },
]);
const peak = $derived(
  bins.reduce<Bin | null>((best, b) => (!best || b.count > best.count ? b : best), null)
);
const text = $derived(
  summary ??
    `${title}: ${finite.length} values in ${bins.length} bins${peak ? `; most between ${formatX(peak.x0)} and ${formatX(peak.x1)} (${peak.count})` : ''}${stats.map((s) => `; ${s.kind} ${formatX(s.value)}`).join('')}.`
);
const formatters = {
  x: (v: number | string) => String(v),
  y: (v: number | null) => (v === null ? '—' : `${v} values`),
};
let hidden = $state(new Set<string>());
</script>

<ChartShell
  {title}
  {description}
  summary={text}
  {height}
  margin={{ left: 40 }}
  {loading}
  {error}
  {onretry}
  emptyMessage={emptyMessage}
  {series}
  {formatters}
  xHeader="Range"
  showLegend={false}
  bind:hidden
>
  {#snippet plot(size)}
    <HistogramPlot label={title} {bins} rules={stats} {...size} {formatters} formatX={(v) => formatX(v)} {color} {onselect} />
  {/snippet}
</ChartShell>
