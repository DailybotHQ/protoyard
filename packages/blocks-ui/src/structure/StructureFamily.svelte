<script lang="ts">
import type { Block } from '@protoyard/blocks';
import CardsBlock from './CardsBlock.svelte';
import ColumnsBlock from './ColumnsBlock.svelte';
import ComparisonBlock from './ComparisonBlock.svelte';
import CtaBlock from './CtaBlock.svelte';
import IconBlock from './IconBlock.svelte';
import StepsBlock from './StepsBlock.svelte';
import TimelineBlock from './TimelineBlock.svelte';

let { block }: { block: Block } = $props();
</script>

{#if block.type === 'timeline'}
  <TimelineBlock {block} />
{:else if block.type === 'steps'}
  <StepsBlock {block} />
{:else if block.type === 'comparison'}
  <ComparisonBlock {block} />
{:else if block.type === 'cards'}
  <CardsBlock {block} />
{:else if block.type === 'icon'}
  <IconBlock {block} />
{:else if block.type === 'cta'}
  <CtaBlock {block} />
{:else if block.type === 'columns'}
  <ColumnsBlock {block} />
{:else}
  <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
    This structure block needs a newer Protoyard.
  </p>
{/if}
