<script lang="ts">
import type { Margin, Rect } from '@protoyard/charts';
import type { Snippet } from 'svelte';
import ChartFrame from '../frame/ChartFrame.svelte';
import Legend from '../interaction/Legend.svelte';
import type { ChartFormatters, PlotSeries } from '../interaction/model.ts';
import TableToggle from '../interaction/TableToggle.svelte';
import { type CartesianSeries, colorFor, isEmpty } from './model.ts';

type Props = {
  title: string;
  description?: string;
  summary: string;
  height: number;
  margin?: Partial<Margin>;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  /** Empty-state message; shown when every value is missing. */
  emptyMessage?: string;
  series: readonly CartesianSeries[];
  formatters: ChartFormatters;
  xHeader: string;
  /** Legend labels (e.g. "Revenue (left axis)"); defaults to the series labels. */
  legendLabels?: Record<string, string>;
  showLegend?: boolean;
  showTable?: boolean;
  hidden: Set<string>;
  plot: Snippet<[{ width: number; height: number; plot: Rect }]>;
};

let {
  title,
  description,
  summary,
  height,
  margin,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  series,
  formatters,
  xHeader,
  legendLabels = {},
  showLegend = true,
  showTable = true,
  hidden = $bindable(),
  plot,
}: Props = $props();

const uid = $props.id();
let tableShown = $state(false);
const empty = $derived(!loading && !error && isEmpty(series) ? (emptyMessage ?? true) : false);
const items = $derived(
  series.map((s, i) => ({ id: s.id, label: legendLabels[s.id] ?? s.label, color: colorFor(s, i) }))
);
// The table needs values only; positions are irrelevant there.
const tableSeries = $derived<PlotSeries[]>(
  series.map((s) => ({
    id: s.id,
    label: s.label,
    points: s.points.map((p) => ({ x: 0, y: 0, xValue: p.x, yValue: p.y })),
  }))
);
</script>

<ChartFrame {title} {description} {summary} {height} {margin} {loading} {empty} {error} {onretry}>
  {#snippet children(size)}
    {#if tableShown}
      <div id="{uid}-table" class="absolute inset-0 overflow-auto">
        <!-- Loaded on demand: most viewers never open the table. -->
        {#await import('../interaction/ChartTable.svelte') then { default: ChartTable }}
          <ChartTable caption={title} series={tableSeries} {hidden} {formatters} {xHeader} />
        {/await}
      </div>
    {:else}
      {@render plot(size)}
    {/if}
  {/snippet}
  {#snippet footer()}
    <div class="flex flex-wrap items-center justify-between gap-2">
      {#if showLegend && series.length > 1}
        <Legend {items} {hidden} onchange={(next) => (hidden = next)} label="{title} series" />
      {:else}
        <span></span>
      {/if}
      {#if showTable}<TableToggle bind:showing={tableShown} controls="{uid}-table" />{/if}
    </div>
  {/snippet}
</ChartFrame>
