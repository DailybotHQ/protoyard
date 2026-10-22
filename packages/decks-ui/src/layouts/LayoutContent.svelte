<script lang="ts">
import type { Block } from '@protoyard/blocks';
import { BlockRenderer } from '@protoyard/blocks-ui';
import type { DeckLayoutId } from '@protoyard/decks';
import { composeLayout, deckInputGuardAttributes } from './compose.ts';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
const composition = $derived(composeLayout(layout, props));
</script>

{#if composition.ok}
  <section
    data-py-deck-layout={layout}
    class="deck-layout grid h-full w-full content-center gap-8 overflow-hidden p-16 text-foreground"
  >
    {#each composition.blocks as block, index (index)}
      {@const guarded = deckInputGuardAttributes(block as Block)}
      <div class="min-w-0" {...guarded}>
        <BlockRenderer blocks={[block]} />
      </div>
    {/each}
  </section>
{:else}
  <p class="p-8 text-[24px] text-foreground" role="note">{composition.message}</p>
{/if}

<style>
  .deck-layout :global(p),
  .deck-layout :global(li),
  .deck-layout :global(blockquote),
  .deck-layout :global(pre),
  .deck-layout :global(code),
  .deck-layout :global(td),
  .deck-layout :global(th) {
    font-size: max(24px, 1em);
    line-height: 1.35;
  }

  .deck-layout :global(small),
  .deck-layout :global(caption),
  .deck-layout :global(figcaption),
  .deck-layout :global(dt),
  .deck-layout :global(label),
  .deck-layout :global(button),
  .deck-layout :global([role='tab']),
  .deck-layout :global([role='button']),
  .deck-layout :global([data-py-label]) {
    font-size: max(18px, 0.75em);
  }

  .deck-layout :global(svg text) {
    font-size: max(18px, 1em);
  }
</style>
