<script lang="ts">
import { CODE_LANGUAGES } from '@protoyard/blocks';
import type { CodeWithCalloutPropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { fitContent, fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';
import { getPropSteps } from '../prop-steps.ts';

let { props: p }: { props: PropsOf<typeof CodeWithCalloutPropsSchema> } = $props();
const steps = getPropSteps();
const code = $derived({
  type: 'code',
  code: p.code.source,
  lang: (CODE_LANGUAGES as readonly string[]).includes(p.code.lang) ? p.code.lang : 'text',
  ...(p.code.highlights && p.code.highlights.length > 0 ? { highlights: p.code.highlights } : {}),
});
</script>

<SlideFrame layout="code-with-callout" class="gap-[2.6cqw] px-[6cqw] py-[5cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <div class="grid min-h-0 flex-1 grid-cols-[1.45fr_1fr] content-center items-start gap-[2.6cqw] @max-[48rem]:grid-cols-1">
    <div {...steps(['code'])} class="deck-code min-h-0 overflow-hidden rounded-[1.6cqw] border border-border bg-card shadow-float" data-slot="code" {@attach fitContent(0.6)}>
      <Blocks blocks={[code]} />
    </div>
    <aside class="flex min-h-0 flex-col gap-[1.6cqw] rounded-[1.6cqw] border border-primary/30 bg-primary/10 p-[2.6cqw]" data-slot="callout" {@attach fitContent()}>
      {#if p.heading}
        <h3 class={`${DECK_TYPE.label} text-primary`}>{p.heading}</h3>
      {/if}
      <ul class="flex flex-col gap-[1.2cqw]">
        {#each p.bullets as bullet, index (index)}
          <li class={`flex items-start gap-[1.2cqw] ${DECK_TYPE.body}`}>
            <span aria-hidden="true" class="mt-[0.35em] inline-block size-[0.55em] shrink-0 rounded-full bg-primary"></span>
            <span class="min-w-0">{bullet}</span>
          </li>
        {/each}
      </ul>
    </aside>
  </div>
</SlideFrame>

<style>
  /* Code reads from the back of the room; the block's own chrome stays. */
  .deck-code :global(pre),
  .deck-code :global(code) {
    font-size: max(20px, 1.6cqw);
    line-height: 1.5;
  }
  .deck-code :global([data-py-deck-interactive]),
  .deck-code :global(figure) {
    height: 100%;
    margin: 0;
  }
</style>
