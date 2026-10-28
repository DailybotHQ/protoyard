<script lang="ts">
import type { StatBlock } from '@protoyard/blocks';
import { Stat } from 'texuli/stat';

/**
 * Figures as one row of Texuli stats that stacks on phones. The row's title
 * and source stay Protoyard's text (the stat block fields Texuli's renderer
 * does not carry yet, G21).
 */
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
  <ul class="m-0 grid list-none gap-4 p-0 {columns}">
    {#each block.items as item, i (i)}
      <li class="min-w-0">
        <Stat
          label={item.label}
          value={item.value}
          delta={item.delta}
          hint={item.context}
          class="h-full text-center"
        />
      </li>
    {/each}
  </ul>
  {#if block.source}<p class="text-center text-xs text-muted-foreground">Source: {block.source}</p>{/if}
</section>
