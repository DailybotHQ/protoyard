<script lang="ts">
/** Adapter: Protoyard Treemap → Texuli TreemapChart (`root` prop). */
import { TreemapChart } from '@texuli/charts/part-whole';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  title: string;
  description?: string;
  data?: unknown;
  tree?: unknown;
  root?: unknown;
  emptyMessage?: string;
  [key: string]: unknown;
};

let { title, description, data, tree, root, emptyMessage }: Props = $props();
const desc = $derived(description ?? emptyMessage ?? title);
const treeRoot = $derived((root ?? tree ?? data) as never);
</script>

<ChartRoot title={title}>
{#if !treeRoot}
  <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
{:else}
  <TreemapChart
    {title}
    description={desc}
    root={treeRoot}
    labels={{ table: 'Tree', category: 'Node', value: 'Value' }}
  />
{/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--py-muted-foreground, CanvasText);
  }
</style>

