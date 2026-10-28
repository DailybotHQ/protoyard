<script lang="ts">
/** Adapter: Protoyard Heatmap → Texuli HeatmapChart. */
import { HeatmapChart } from '@texuli/charts/matrix';
import ChartRoot from '../compat/ChartRoot.svelte';

type Cell = { x: string; y: string; value: number };

type Props = {
  title: string;
  description?: string;
  cells?: readonly Cell[];
  data?: readonly Cell[];
  emptyMessage?: string;
  [key: string]: unknown;
};

let { title, description, cells, data, emptyMessage }: Props = $props();
const desc = $derived(description ?? emptyMessage ?? title);
const list = $derived(cells ?? data ?? []);
</script>

<ChartRoot title={title}>
{#if list.length === 0}
  <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
{:else}
  <HeatmapChart {title} description={desc} cells={list} />
{/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--tx-muted-foreground, CanvasText);
  }
</style>

