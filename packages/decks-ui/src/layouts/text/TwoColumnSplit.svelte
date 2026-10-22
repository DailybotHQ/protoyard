<script lang="ts">
import type { TwoColumnSplitPropsSchema } from '@protoyard/decks/layouts';
import { fitContent, fitText } from '../design/fit.ts';
import Markdown from '../design/Markdown.svelte';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof TwoColumnSplitPropsSchema> } = $props();
const sides = $derived([
  { slot: 'left', ...p.left, accent: false },
  { slot: 'right', ...p.right, accent: true },
]);
</script>

<SlideFrame layout="two-column-split" class="gap-[3cqw] px-[7cqw] py-[6cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <div class="relative grid min-h-0 flex-1 grid-cols-2 content-center items-stretch gap-[3cqw] @max-[48rem]:grid-cols-1" data-slot="columns" {@attach fitContent()}>
    {#each sides as side (side.slot)}
      <article
        class={`flex min-w-0 flex-col gap-[1.4cqw] rounded-[2cqw] border p-[3cqw] ${side.accent ? 'border-primary/40 bg-primary/10' : 'border-border bg-card text-card-foreground'}`}
        data-slot={side.slot}
      >
        {#if side.heading}
          <h3 class={`${DECK_TYPE.label} ${side.accent ? 'text-primary' : 'text-muted-foreground'}`}>{side.heading}</h3>
        {/if}
        <Markdown text={side.body} class={`${DECK_TYPE.body} text-foreground`} />
      </article>
    {/each}
    <span aria-hidden="true" class="absolute top-1/2 left-1/2 grid size-[5cqw] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-[length:clamp(18px,1.6cqw,22px)] font-semibold text-muted-foreground shadow-soft @max-[48rem]:hidden" data-slot="versus">→</span>
  </div>
</SlideFrame>
