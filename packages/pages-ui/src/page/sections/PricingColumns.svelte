<script lang="ts">
import type { CardsBlock } from '@protoyard/blocks';
import { Button } from '@protoyard/ui';
import { highlightedPlan, safePageHref } from '../design.ts';
import PlainText from './PlainText.svelte';

/**
 * Plans as pricing columns. One plan (the `accent` card, else the middle of an
 * odd row) is lifted with the primary color; the columns stack on phones.
 */
let { block }: { block: CardsBlock } = $props();

const COLUMNS: Record<number, string> = {
  2: 'md:grid-cols-2 md:max-w-4xl md:mx-auto',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
};
const count = $derived(block.columns ?? Math.min(block.items.length, 4));
const columns = $derived(COLUMNS[count] ?? '');
const highlight = $derived(highlightedPlan(block));
</script>

<section class="grid gap-6" aria-label={block.title ?? 'Plans'} data-py-page-pricing>
  {#if block.title}
    <p class="text-center font-heading text-lg font-semibold text-foreground">{block.title}</p>
  {/if}
  <ul class="grid w-full items-stretch gap-6 {columns}">
    {#each block.items as card, index (index)}
      {@const href = card.href ? safePageHref(card.href) : null}
      {@const lifted = index === highlight}
      <li
        class="flex flex-col gap-4 rounded-2xl border p-6 sm:p-8 {lifted
          ? 'border-primary bg-surface shadow-lg ring-1 ring-primary md:-my-3 md:py-10'
          : 'border-border bg-surface shadow-soft'}"
        data-py-page-plan={index}
        data-highlighted={lifted ? 'true' : undefined}
      >
        {#if lifted}
          <span class="h-1 w-12 rounded-full bg-primary" aria-hidden="true"></span>
        {/if}
        <h3 class="font-heading text-xl font-semibold text-foreground">{card.title}</h3>
        {#if card.eyebrow}
          <p class="font-heading text-3xl font-bold tracking-tight text-foreground">{card.eyebrow}</p>
        {/if}
        {#if card.body}<PlainText text={card.body} class="text-base text-muted-foreground" />{/if}
        {#if href}
          <div class="mt-auto pt-2">
            <Button href={href} variant={lifted ? 'default' : 'outline'} size="lg" class="w-full">
              Choose {card.title}
            </Button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</section>
