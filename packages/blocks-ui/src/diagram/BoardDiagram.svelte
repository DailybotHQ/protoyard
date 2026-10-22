<script lang="ts">
import type { BoardBlock } from '@protoyard/blocks';
import { toneBorder } from './tones.ts';

/** A board: columns of cards as labelled lists, so the structure is the text alternative. */
let { block }: { block: BoardBlock } = $props();

const cards = $derived(block.columns.reduce((sum, column) => sum + column.cards.length, 0));
const summary = $derived(
  `Board with ${block.columns.length} ${block.columns.length === 1 ? 'column' : 'columns'} and ${cards} ${cards === 1 ? 'card' : 'cards'}`
);
</script>

<figure class="grid gap-2" data-py-diagram="board">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a wide board scrolls; keyboard users must reach it (WCAG 2.1.1). -->
  <div
    class="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    role="region"
    aria-label={summary}
    tabindex="0"
  >
    <div class="flex min-w-max gap-4 p-1">
      {#each block.columns as column (column.id)}
        <section
          class="grid w-56 shrink-0 content-start gap-2 rounded-lg border border-border bg-muted/40 p-2"
          aria-label="{column.title}, {column.cards.length} {column.cards.length === 1 ? 'card' : 'cards'}"
          data-column={column.id}
        >
          <p class="flex items-center justify-between px-1 text-sm font-semibold text-foreground" aria-hidden="true">
            <span class="truncate">{column.title}</span>
            <span class="text-xs font-normal text-muted-foreground">{column.cards.length}</span>
          </p>
          {#if column.cards.length > 0}
            <ul class="grid gap-2">
              {#each column.cards as card (card.id)}
                <li class={['rounded-md border border-l-4 bg-surface px-3 py-2 text-sm text-surface-foreground shadow-soft', toneBorder(card.tone)]} data-card={card.id}>
                  {card.title}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="px-1 text-xs text-muted-foreground">No cards</p>
          {/if}
        </section>
      {/each}
    </div>
  </div>
</figure>
