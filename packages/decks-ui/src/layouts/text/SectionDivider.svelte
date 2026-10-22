<script lang="ts">
import type { SectionDividerPropsSchema } from '@protoyard/decks/layouts';
import { fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof SectionDividerPropsSchema> } = $props();
</script>

<SlideFrame layout="section-divider" class="justify-center px-[9cqw]">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden" data-slot="decor">
    <div class="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/20 via-primary/5 to-transparent"></div>
    <div class="pointer-events-none absolute inset-y-0 left-0 w-[1.4cqw] bg-primary" data-slot="band"></div>
  </div>
  <div class="relative flex flex-col gap-[2cqw]" data-slot="divider">
    {#if p.eyebrow}
      <p class={`${DECK_TYPE.label} text-primary`} data-slot="eyebrow">{p.eyebrow}</p>
    {/if}
    <h1 class={`${DECK_TYPE.display} line-clamp-3`} data-slot="title" {@attach fitText(56)}>{p.title}</h1>
    <span aria-hidden="true" class="mt-[1cqw] block h-[0.5cqw] w-[16cqw] rounded-full bg-primary/60" data-slot="rule"></span>
  </div>
</SlideFrame>
