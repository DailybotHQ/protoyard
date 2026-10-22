<script lang="ts">
import { safeHref } from '@protoyard/ai/markdown';
import type { CardsBlock as CardsBlockData } from '@protoyard/blocks';
import { getBlockHost } from '../host.ts';
import BlockIcon from './BlockIcon.svelte';
import SafeBody from './SafeBody.svelte';
import { toneBorder, toneIcon } from './tones.ts';

let { block }: { block: CardsBlockData } = $props();
const host = getBlockHost();
const cols = $derived(block.columns ?? 3);
const slide = $derived(host.canvasMode === 'slide');
// A slide is a fixed-size canvas scaled to the screen: viewport breakpoints
// (sm:, lg:) follow the phone, not the slide, and would stack the cards past
// the stage. On a slide the columns are fixed.
const gridClass = $derived(
  slide
    ? cols === 2
      ? 'grid-cols-2'
      : cols === 4
        ? 'grid-cols-4'
        : 'grid-cols-3'
    : cols === 2
      ? 'max-[639px]:grid-cols-1 sm:grid-cols-2'
      : cols === 4
        ? 'max-[639px]:grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        : 'max-[639px]:grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
);
</script>

<section class="grid gap-4" data-block-type="cards" aria-label={block.title ?? 'Cards'}>
  {#if block.title}
    <h3 class="font-heading text-lg font-semibold text-foreground">{block.title}</h3>
  {/if}
  <ul class="grid gap-4 {gridClass}">
    {#each block.items as card, index (index)}
      {@const href = card.href ? safeHref(card.href) : null}
      <li
        class="grid gap-3 rounded-xl border bg-surface p-4 shadow-soft {toneBorder(card.tone)}"
      >
        {#if card.icon}
          <span class="grid size-10 place-items-center rounded-lg {toneIcon(card.tone)}" aria-hidden="true">
            <BlockIcon name={card.icon} class="size-5" />
          </span>
        {/if}
        {#if card.eyebrow}
          <p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{card.eyebrow}</p>
        {/if}
        {#if href}
          <a href={href} class="font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {card.title}
          </a>
        {:else}
          <p class="font-semibold text-foreground">{card.title}</p>
        {/if}
        {#if card.body}<SafeBody text={card.body} />{/if}
      </li>
    {/each}
  </ul>
</section>
