<script lang="ts">
import type { Rect } from '@protoyard/charts';
import type { Snippet } from 'svelte';
import ChartFrame from '../frame/ChartFrame.svelte';
import type { ChartFormatters, PlotSeries } from '../interaction/model.ts';
import TableToggle from '../interaction/TableToggle.svelte';
import RampLegend from './RampLegend.svelte';

type Props = {
  title: string;
  description?: string;
  summary: string;
  height: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  empty: boolean | string;
  /** The same data for the table view: one series per column. */
  tableSeries: readonly PlotSeries[];
  formatters: ChartFormatters;
  xHeader: string;
  ramp: {
    min: number;
    max: number;
    format: (v: number) => string;
    diverging?: boolean;
    emptyLabel?: string;
  };
  plot: Snippet<[{ width: number; height: number; plot: Rect }]>;
};

let {
  title,
  description,
  summary,
  height,
  loading,
  error,
  onretry,
  empty,
  tableSeries,
  formatters,
  xHeader,
  ramp,
  plot,
}: Props = $props();

const uid = $props.id();
let tableShown = $state(false);
</script>

<ChartFrame
  {title}
  {description}
  {summary}
  {height}
  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
  {loading}
  {empty}
  {error}
  {onretry}
>
  {#snippet children(size)}
    {#if tableShown}
      <div id="{uid}-table" class="absolute inset-0 overflow-auto">
        {#await import('../interaction/ChartTable.svelte') then { default: ChartTable }}
          <ChartTable caption={title} series={tableSeries} {formatters} {xHeader} />
        {/await}
      </div>
    {:else}
      {@render plot(size)}
    {/if}
  {/snippet}
  {#snippet footer()}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <RampLegend {...ramp} label="{title} scale" />
      <TableToggle bind:showing={tableShown} controls="{uid}-table" />
    </div>
  {/snippet}
</ChartFrame>
