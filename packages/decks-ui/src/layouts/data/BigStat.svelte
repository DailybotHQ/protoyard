<script lang="ts">
import type { BigStatPropsSchema } from '@protoyard/decks/layouts';
import { fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof BigStatPropsSchema> } = $props();
</script>

<SlideFrame layout="big-stat" class="justify-center px-[8cqw] py-[6cqw]">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden" data-slot="decor">
    <div class="pointer-events-none absolute top-1/2 right-[6cqw] size-[38cqw] -translate-y-1/2 rounded-full border-[1.6cqw] border-primary/10"></div>
    <div class="pointer-events-none absolute top-1/2 right-[12cqw] size-[22cqw] -translate-y-1/2 rounded-full bg-primary/10 blur-2xl"></div>
  </div>
  <div class="relative flex max-w-[82%] flex-col gap-[1.8cqw]" data-slot="stat">
    <p class={`${DECK_TYPE.stat} line-clamp-1 text-primary`} data-slot="number" {@attach fitText(96)}>{p.number}</p>
    <p class={`${DECK_TYPE.lead} line-clamp-2 max-w-[30ch] font-heading font-semibold text-foreground`} data-slot="label">{p.label}</p>
    {#if p.context}
      <p class={`${DECK_TYPE.body} line-clamp-2 text-muted-foreground`} data-slot="context">{p.context}</p>
    {/if}
  </div>
  {#if p.source}
    <p class={`${DECK_TYPE.caption} absolute bottom-[4.5cqw] left-[8cqw] text-muted-foreground`} data-slot="source">Source: {p.source}</p>
  {/if}
</SlideFrame>
