<script lang="ts">
/** Adapter: Protoyard SankeyChart → Texuli flow SankeyChart. */
import { SankeyChart as TexuliSankeyChart } from '@texuli/charts/flow';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  title: string;
  description?: string;
  nodes?: readonly { id: string; label?: string }[];
  links?: readonly { source: string; target: string; value: number }[];
  emptyMessage?: string;
  [key: string]: unknown;
};

let { title, description, nodes = [], links = [], emptyMessage }: Props = $props();
const desc = $derived(description ?? emptyMessage ?? title);
</script>

<ChartRoot title={title}>
{#if nodes.length === 0 || links.length === 0}
  <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
{:else}
  <TexuliSankeyChart {title} description={desc} {nodes} {links} />
{/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--py-muted-foreground, CanvasText);
  }
</style>

