<script lang="ts">
/**
 * Data family dispatcher.
 * - chart → ChartSpec→Texuli adapter (ChartBlock)
 * - interactive table → local TableBlock (sort/filter)
 * - plain table/stat → Texuli DataBlockView with shape adapter
 */
import type { Block } from '@protoyard/blocks';
import { DataBlockView } from '@texuli/blocks/data/renderers';
import { toTexuliStatBlock, toTexuliTableBlock } from '../compat/data.ts';
import ChartBlock from './ChartBlock.svelte';
import StatBlock from './StatBlock.svelte';
import TableBlock from './TableBlock.svelte';

let { block }: { block: Block } = $props();

const interactiveTable = $derived(
  block.type === 'table' &&
    Boolean(block.interactive && Object.values(block.interactive).some(Boolean))
);
// Sparklines / title / source need local StatBlock
const richStat = $derived(
  block.type === 'stat' &&
    (Boolean(block.title) ||
      Boolean(block.source) ||
      (block.items ?? []).some((i) => Array.isArray(i.trend) && i.trend.length > 0))
);
</script>

<div data-py-block-family="data" data-tx-blocks="data">
  {#if block.type === 'chart'}
    <ChartBlock {block} />
  {:else if block.type === 'table' && interactiveTable}
    <TableBlock {block} />
  {:else if block.type === 'stat' && richStat}
    <StatBlock {block} />
  {:else if block.type === 'stat'}
    <DataBlockView block={toTexuliStatBlock(block)} />
  {:else if block.type === 'table'}
    <DataBlockView block={toTexuliTableBlock(block)} />
  {:else}
    <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
      This block is not a data block.
    </p>
  {/if}
</div>
