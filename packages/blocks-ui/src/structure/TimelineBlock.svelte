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
      ? 'grid gap-6 border-l-2 border-border'
      : 'grid gap-4 sm:grid-flow-col sm:auto-cols-fr sm:gap-3'}
  >
    {#each block.events as event, index (index)}
      <li
        class={vertical
          ? '-ml-[11px] grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-1'
          : 'grid gap-2 rounded-lg border border-border bg-surface p-3'}
        data-py-timeline-event
      >
        {#if vertical}
          <span
            class="col-start-1 row-span-3 mt-0.5 grid size-5 place-items-center rounded-full border-2 border-background {toneIcon(
              event.tone
            )}"
            data-py-timeline-marker
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
        <p
          class="text-xs font-semibold tracking-wide text-muted-foreground uppercase {vertical
            ? 'col-start-2'
            : ''}"
          data-py-timeline-time
        >
          {event.time}
        </p>
        <p class={vertical ? 'col-start-2 font-medium text-foreground' : 'font-medium text-foreground'}>
          {event.title}
        </p>
        {#if event.body}<div class={vertical ? 'col-start-2' : ''}><SafeBody text={event.body} /></div>{/if}
      </li>
    {/each}
  </ol>
</section>
