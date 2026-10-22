<script lang="ts">
import type { ClosingCtaPropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof ClosingCtaPropsSchema> } = $props();
</script>

<SlideFrame layout="closing-cta" class="items-center justify-center px-[9cqw] py-[7cqw] text-center">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden" data-slot="decor">
    <div class="pointer-events-none absolute inset-x-[10cqw] -bottom-[30cqw] h-[50cqw] rounded-full bg-primary/15 blur-3xl"></div>
  </div>
  <div class="relative flex max-w-[90%] flex-col items-center gap-[2.4cqw]" data-slot="closing">
    <h2 class={`${DECK_TYPE.display} line-clamp-3`} data-slot="title" {@attach fitText(56)}>{p.title}</h2>
    {#if p.text}
      <p class={`${DECK_TYPE.lead} line-clamp-3 max-w-[40ch] text-muted-foreground`} data-slot="text">{p.text}</p>
    {/if}
    <div class="deck-cta mt-[1cqw]" data-slot="action">
      <Blocks blocks={[{ type: 'cta', actions: [{ label: p.cta.label, href: p.cta.href }] }]} />
    </div>
  </div>
  {#if p.footnote}
    <p class={`${DECK_TYPE.caption} absolute bottom-[4.5cqw] text-muted-foreground`} data-slot="footnote">{p.footnote}</p>
  {/if}
</SlideFrame>

<style>
  /* The shared CTA block, restyled as the slide's one big action. */
  .deck-cta :global([data-block-type='cta']) {
    border: 0;
    background: transparent;
    box-shadow: none;
    padding: 0;
    justify-items: center;
  }
  .deck-cta :global(a),
  .deck-cta :global(button) {
    height: auto;
    min-height: 0;
    padding: 0.7em 1.6em;
    border-radius: 999px;
    font-size: clamp(22px, 2cqw, 28px);
    font-weight: 600;
  }
</style>
