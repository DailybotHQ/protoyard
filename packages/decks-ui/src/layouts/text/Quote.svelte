<script lang="ts">
import type { QuotePropsSchema } from '@protoyard/decks/layouts';
import { fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof QuotePropsSchema> } = $props();
</script>

<SlideFrame layout="quote" class="justify-center px-[11cqw] py-[7cqw]">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden" data-slot="decor">
    <span class="pointer-events-none absolute top-[1cqw] left-[5cqw] font-heading text-[length:clamp(160px,24cqw,320px)] leading-none text-primary/20 select-none" data-slot="mark">“</span>
  </div>
  <figure class="relative m-0 flex flex-col gap-[3cqw]" data-slot="quote">
    <blockquote class={`${DECK_TYPE.quote} m-0 line-clamp-5 text-foreground`} data-slot="pull-quote" {@attach fitText(36)}>{p.quote}</blockquote>
    {#if p.cite}
      <figcaption class="flex items-center gap-[1.6cqw]" data-slot="cite">
        <span aria-hidden="true" class="block h-[0.4cqw] w-[6cqw] rounded-full bg-primary"></span>
        <span class={`${DECK_TYPE.lead} text-muted-foreground`}>{p.cite}</span>
      </figcaption>
    {/if}
  </figure>
</SlideFrame>
