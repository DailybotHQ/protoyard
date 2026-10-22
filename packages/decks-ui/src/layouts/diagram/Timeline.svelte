<script lang="ts">
import type { TimelinePropsSchema } from '@protoyard/decks/layouts';
import { fitContent, fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';
import { getPropSteps } from '../step-context.ts';

/**
 * Events on a horizontal axis with markers. Up to five share one line; six to
 * eight split into two lines so each event keeps a readable width.
 */
let { props: p }: { props: PropsOf<typeof TimelinePropsSchema> } = $props();
const steps = getPropSteps();
// Events split across two rows keep their index into `events` for step lookups.
const firstRowLength = $derived(
  p.events.length <= 5 ? p.events.length : Math.ceil(p.events.length / 2)
);
const rows = $derived.by(() => {
  const events = p.events;
  if (events.length <= 5) return [events];
  const half = Math.ceil(events.length / 2);
  return [events.slice(0, half), events.slice(half)];
});
</script>

<SlideFrame layout="timeline" class="gap-[3.4cqw] px-[6cqw] py-[6cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col justify-center gap-[4cqw]" data-slot="timeline" {@attach fitContent()}>
    {#each rows as row, r (r)}
      <ol class="relative grid gap-[2cqw]" style={`grid-template-columns:repeat(${row.length},minmax(0,1fr))`} data-slot="axis">
        <span aria-hidden="true" class="absolute top-[4.6cqw] right-0 left-0 h-[0.35cqw] rounded-full bg-linear-to-r from-primary/60 to-primary/15" data-slot="line"></span>
        {#each row as event, index (index)}
          <li {...steps(['events', r * firstRowLength + index])} class="relative flex min-w-0 flex-col gap-[1.2cqw]" data-slot="event">
            <p class={`${DECK_TYPE.label} text-primary`}>{event.time}</p>
            <span aria-hidden="true" class="relative z-10 block size-[2.2cqw] rounded-full border-[0.5cqw] border-primary bg-background" data-slot="marker"></span>
            <p class={`${DECK_TYPE.body} line-clamp-3 text-foreground`}>{event.text}</p>
          </li>
        {/each}
      </ol>
    {/each}
  </div>
</SlideFrame>
