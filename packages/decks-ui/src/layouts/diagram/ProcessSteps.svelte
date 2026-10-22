<script lang="ts">
import type { ProcessStepsPropsSchema } from '@protoyard/decks/layouts';
import { fitContent, fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';
import { getPropSteps } from '../step-context.ts';

/** Numbered steps on one line, joined by a connector (stacked on portrait stages). */
let { props: p }: { props: PropsOf<typeof ProcessStepsPropsSchema> } = $props();
const steps = getPropSteps();
</script>

<SlideFrame layout="process-steps" class="gap-[4cqw] px-[6cqw] py-[6cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <ol
    class="relative grid min-h-0 flex-1 content-center gap-[2.4cqw] @max-[48rem]:!grid-cols-1"
    style={`grid-template-columns:repeat(${p.steps.length},minmax(0,1fr))`}
    data-slot="steps"
    {@attach fitContent()}
  >
    {#each p.steps as step, index (index)}
      <li {...steps(['steps', index])} class="relative flex min-w-0 flex-col gap-[1.4cqw] @max-[48rem]:flex-row @max-[48rem]:items-start" data-slot="step">
        {#if index < p.steps.length - 1}
          <span aria-hidden="true" class="absolute top-[3cqw] left-[6cqw] h-[0.35cqw] w-[calc(100%-3.6cqw)] rounded-full bg-primary/35 @max-[48rem]:hidden" data-slot="connector"></span>
        {/if}
        <span aria-hidden="true" class="relative z-10 grid size-[6cqw] shrink-0 place-items-center rounded-full bg-primary font-heading text-[length:clamp(24px,2.6cqw,34px)] font-bold text-primary-foreground shadow-float ring-[0.8cqw] ring-background">{index + 1}</span>
        <div class="flex min-w-0 flex-col gap-[0.8cqw]">
          <h3 class={`${DECK_TYPE.lead} font-heading font-semibold`}>{step.title}</h3>
          {#if step.body}<p class={`${DECK_TYPE.body} text-muted-foreground`}>{step.body}</p>{/if}
        </div>
      </li>
    {/each}
  </ol>
</SlideFrame>
