<script lang="ts">
import type { TimelineBlock } from '@protoyard/blocks';
import { getBlockHost } from '../host.ts';
import BlockIcon from './BlockIcon.svelte';
import SafeBody from './SafeBody.svelte';
import { toneIcon } from './tones.ts';

let { block }: { block: TimelineBlock } = $props();
const host = getBlockHost();
const vertical = $derived(block.orientation !== 'horizontal' || host.canvasMode === 'flow');
</script>

<section
  class="grid gap-4"
  data-block-type="timeline"
  data-orientation={vertical ? 'vertical' : 'horizontal'}
  aria-label={block.title ?? 'Timeline'}
>
  {#if block.title}
    <h3 class="font-heading text-lg font-semibold text-foreground">{block.title}</h3>
  {/if}
  <ol
    class={vertical
      ? 'relative grid gap-6 border-l-2 border-border pl-6'
      : 'grid gap-4 sm:grid-flow-col sm:auto-cols-fr sm:gap-3'}
  >
    {#each block.events as event, index (index)}
      <li class={vertical ? 'relative grid gap-1' : 'grid gap-2 rounded-lg border border-border bg-surface p-3'}>
        {#if vertical}
          <span
            class="absolute top-0 -left-[1.4rem] grid size-5 place-items-center rounded-full border-2 border-background {toneIcon(
              event.tone
            )}"
            aria-hidden="true"
          >
            {#if event.icon}
              <BlockIcon name={event.icon} class="size-3" />
            {:else}
              <span class="size-2 rounded-full bg-current"></span>
            {/if}
          </span>
        {:else if event.icon}
          <span class="grid size-9 place-items-center rounded-md {toneIcon(event.tone)}" aria-hidden="true">
            <BlockIcon name={event.icon} class="size-4" />
          </span>
        {/if}
        <p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{event.time}</p>
        <p class="font-medium text-foreground">{event.title}</p>
        {#if event.body}<SafeBody text={event.body} />{/if}
      </li>
    {/each}
  </ol>
</section>
