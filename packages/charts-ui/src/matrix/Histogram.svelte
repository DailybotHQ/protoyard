<script lang="ts">
/** Adapter: Protoyard Histogram → Texuli BarChart of bins. */
import { BarChart } from '@texuli/charts/cartesian';
import { bin } from '@texuli/charts/math';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  title: string;
  description?: string;
  values?: readonly number[];
  emptyMessage?: string;
  [key: string]: unknown;
};

let { title, description, values = [], emptyMessage }: Props = $props();
const desc = $derived(description ?? emptyMessage ?? title);
const series = $derived.by(() => {
  const bins = bin(values);
  return [
    {
      id: 'count',
      label: 'Count',
      points: bins.map((b) => ({
        x: `${b.x0}–${b.x1}`,
        y: b.count,
      })),
    },
  ];
});
</script>

<ChartRoot title={title}>
{#if values.length === 0}
  <p class="empty" role="status">{emptyMessage ?? 'No data'}</p>
{:else}
  <BarChart {title} description={desc} {series} />
{/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--py-muted-foreground, CanvasText);
  }
</style>

