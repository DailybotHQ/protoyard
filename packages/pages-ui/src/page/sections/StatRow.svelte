<script lang="ts">
import type { StatBlock } from '@protoyard/blocks';

/** Figures as one row of large numbers that stacks on phones. */
let { block }: { block: StatBlock } = $props();

const COLUMNS: Record<number, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
  6: 'sm:grid-cols-3',
};
const columns = $derived(COLUMNS[block.items.length] ?? 'sm:grid-cols-3');
</script>

<section class="grid gap-4" aria-label={block.title ?? 'Key figures'} data-py-page-stats>
  {#if block.title}
    <p class="text-center text-sm font-semibold text-muted-foreground">{block.title}</p>
  {/if}
  <dl
    class="grid gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-soft {columns}"
  >
    {#each block.items as item, i (i)}
      <div class="flex flex-col items-center gap-2 bg-surface px-6 py-8 text-center sm:py-10">
        <dt class="order-2 text-sm font-medium text-muted-foreground">{item.label}</dt>
        <dd class="order-1 font-heading text-4xl font-bold tracking-tight text-foreground tabular-nums sm:text-5xl">
          {item.value}
        </dd>
        {#if item.delta || item.context}
          <dd class="order-3 text-xs text-muted-foreground">
            {#if item.delta}<span class="font-semibold text-foreground tabular-nums">{item.delta}</span>{/if}
            {#if item.delta && item.context}<span aria-hidden="true"> · </span>{/if}
            {#if item.context}{item.context}{/if}
          </dd>
        {/if}
      </div>
    {/each}
  </dl>
  {#if block.source}<p class="text-center text-xs text-muted-foreground">Source: {block.source}</p>{/if}
</section>
