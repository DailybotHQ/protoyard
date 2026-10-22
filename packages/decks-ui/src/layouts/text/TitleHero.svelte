<script lang="ts">
import type { TitleHeroPropsSchema } from '@protoyard/decks/layouts';
import { fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof TitleHeroPropsSchema> } = $props();
</script>

<SlideFrame layout="title-hero" class="justify-center px-[8cqw] py-[7cqw]">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden" data-slot="decor">
    <div class="pointer-events-none absolute -top-[22cqw] -right-[14cqw] size-[60cqw] rounded-full bg-primary/15 blur-3xl"></div>
    <div class="pointer-events-none absolute -bottom-[26cqw] left-[22cqw] size-[44cqw] rounded-full bg-primary/10 blur-3xl"></div>
  </div>
  <div class="relative flex max-w-[88%] flex-col gap-[2.2cqw]" data-slot="hero">
    <span aria-hidden="true" class="block h-[0.7cqw] w-[8cqw] rounded-full bg-primary" data-slot="accent"></span>
    <h1 class={`${DECK_TYPE.display} line-clamp-3 text-foreground`} data-slot="title" {@attach fitText(56)}>{p.title}</h1>
    {#if p.subtitle}
      <p class={`${DECK_TYPE.lead} line-clamp-2 max-w-[38ch] text-muted-foreground`} data-slot="subtitle">{p.subtitle}</p>
    {/if}
  </div>
  {#if p.meta}
    <p class={`${DECK_TYPE.label} absolute bottom-[5cqw] left-[8cqw] text-primary`} data-slot="meta">{p.meta}</p>
  {/if}
</SlideFrame>
