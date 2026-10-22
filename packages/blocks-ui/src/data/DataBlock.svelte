<script lang="ts">
import type { BlockFamilyRendererProps } from '../registry.ts';
import ChartBlock from './ChartBlock.svelte';
import StatBlock from './StatBlock.svelte';
import TableBlock from './TableBlock.svelte';

/** The data family's dispatcher: stat, table and chart blocks. */
let { block }: BlockFamilyRendererProps = $props();
</script>

{#if block.type === 'stat'}
  <StatBlock {block} />
{:else if block.type === 'table'}
  <TableBlock {block} />
{:else if block.type === 'chart'}
  <ChartBlock {block} />
{:else}
  <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">This block is not a data block.</p>
{/if}
