<script lang="ts">
import type { Block } from '@protoyard/blocks';
import Blocks from '../design/Blocks.svelte';
import { fitContent, fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';

/**
 * A free slide: the author's blocks, with a leading heading promoted to the
 * slide title scale. The content zooms down (to a floor) when it would not fit.
 */
let { blocks }: { blocks: Block[] } = $props();
// A stepped heading stays with the stepped blocks so it reveals in place.
const lead = $derived(
  blocks[0]?.type === 'heading' && blocks[0].step === undefined ? blocks[0] : null
);
const rest = $derived(lead ? blocks.slice(1) : blocks);
</script>

<SlideFrame layout="free" class="gap-[2.4cqw] px-[6cqw] py-[5cqw]">
  {#if lead && lead.type === 'heading'}
    <header class="flex shrink-0 flex-col gap-[0.8cqw]" data-slot="heading">
      {#if lead.eyebrow}<p class={`${DECK_TYPE.label} text-primary`}>{lead.eyebrow}</p>{/if}
      <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{lead.text}</h2>
      {#if lead.subtitle}<p class={`${DECK_TYPE.lead} text-muted-foreground`}>{lead.subtitle}</p>{/if}
    </header>
  {/if}
  <!-- Safe centering: content taller than the slot starts at the top instead of
       overflowing upward over the heading; the heading never shrinks. -->
  <div class="flex min-h-0 flex-1 flex-col justify-center-safe gap-[2cqw]" data-slot="blocks" {@attach fitContent()}>
    <Blocks blocks={rest} />
  </div>
</SlideFrame>
