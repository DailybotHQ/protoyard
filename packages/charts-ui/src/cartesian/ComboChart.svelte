<script lang="ts">
/** Adapter: Protoyard ComboChart → Texuli ComboChart. */
import { ComboChart as TexuliCombo } from '@texuli/charts/cartesian';
import ChartRoot from '../compat/ChartRoot.svelte';
import { type CartesianSeries, toTexuliSeries } from '../compat/series.ts';

type Props = {
  title: string;
  description?: string;
  series: readonly CartesianSeries[];
  emptyMessage?: string;
  class?: string;
  onselect?: (selection: unknown) => void;
  [key: string]: unknown;
};

let { title, description, series, emptyMessage, class: className, onselect }: Props = $props();
const desc = $derived(description ?? emptyMessage ?? `${title}.`);
const mapped = $derived(toTexuliSeries(series));
const interactive = $derived(true); // Texuli table toggle + keyboard; ChartAnswer opts out
</script>

<ChartRoot {title}>
  {#if mapped.every((s) => s.points.length === 0)}
    <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
  {:else}
    <TexuliCombo
      {title}
      description={desc}
      series={mapped}
      class={className}
      {interactive}
      {onselect}
    />
  {/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--tx-muted-foreground, CanvasText);
  }
</style>
