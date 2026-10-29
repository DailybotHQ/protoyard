<script lang="ts">
/** Adapter: Protoyard PieChart {data} → Texuli PieChart. */

import { PieChart as TexuliChart } from '@texuli/charts/part-whole';
import ChartRoot from '../compat/ChartRoot.svelte';

type Slice = { id: string; label: string; value: number };

type Props = {
  title: string;
  description?: string;
  data: readonly Slice[];
  emptyMessage?: string;
  height?: number;
  [key: string]: unknown;
};

let { title, description, data, emptyMessage, height = 240 }: Props = $props();
const desc = $derived(description ?? emptyMessage ?? `${title}.`);
const labels = { table: title, category: 'Category', value: 'Value' };
const size = $derived(Math.max(120, height));
</script>

<ChartRoot {title}>
  {#if data.length === 0}
    <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
  {:else}
    <TexuliChart {title} description={desc} {data} {labels} {size} />
  {/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--tx-muted-foreground, CanvasText);
  }
</style>
