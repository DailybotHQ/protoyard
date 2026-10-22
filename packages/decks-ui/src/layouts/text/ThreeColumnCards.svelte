<script lang="ts">
import { isBlockIcon } from '@protoyard/blocks';
import type { ThreeColumnCardsPropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { fitContent, fitText } from '../design/fit.ts';
import Markdown from '../design/Markdown.svelte';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof ThreeColumnCardsPropsSchema> } = $props();
</script>

<SlideFrame layout="three-column-cards" class="gap-[3cqw] px-[7cqw] py-[6cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <ul class="grid min-h-0 flex-1 grid-cols-3 content-center gap-[2.4cqw] @max-[48rem]:grid-cols-1" data-slot="cards" {@attach fitContent()}>
    {#each p.cards as card, index (index)}
      <li class="flex min-w-0 flex-col gap-[1.4cqw] rounded-[2cqw] border border-border bg-card p-[2.6cqw] text-card-foreground shadow-soft" data-slot="card">
        <div class="deck-card-icon" data-slot="icon">
          {#if card.icon && isBlockIcon(card.icon)}
            <Blocks blocks={[{ type: 'icon', icon: card.icon, decorative: true, size: 'xl', tone: 'accent' }]} />
          {:else}
            <span aria-hidden="true" class="grid size-16 place-items-center rounded-xl bg-primary/15 font-heading text-[length:clamp(24px,2.4cqw,32px)] font-bold text-primary">{index + 1}</span>
          {/if}
        </div>
        <h3 class={`${DECK_TYPE.lead} font-heading font-semibold`}>{card.heading}</h3>
        <Markdown text={card.body} class={`${DECK_TYPE.body} text-muted-foreground`} />
      </li>
    {/each}
  </ul>
</SlideFrame>

<style>
  /* The icon tile reads at slide scale. */
  .deck-card-icon :global([data-block-type='icon'] > span) {
    width: clamp(64px, 5.6cqw, 80px);
    height: clamp(64px, 5.6cqw, 80px);
    border-radius: 1.4cqw;
  }
  .deck-card-icon :global([data-block-type='icon'] svg) {
    width: 50%;
    height: 50%;
  }
</style>
