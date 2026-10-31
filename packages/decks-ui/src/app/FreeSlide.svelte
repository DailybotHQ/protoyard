<script lang="ts">
import type { Block } from '@protoyard/blocks';
import type { DeckSlide, FreeSlide as FreeSlideModel } from '@texuli/deck/model';
import { fitText } from '@texuli/slides/layouts';
import {
  createDeckStepContext,
  type DeckSlideRendererProps,
  deckSlideSteps,
  getDeckStepContext,
} from '@texuli/slides/stage-core';
import { getDeckHostContext } from './context.ts';
import FreeBlock from './FreeBlock.svelte';
import { fitContent } from './fit.ts';

/**
 * Protoyard's free slide renderer for the `@texuli/slides` stage: the
 * author's `@protoyard/blocks` (the stage checked them with DeckApp's
 * `validateBlock`, see `renderers.ts`), with a leading unstepped heading
 * promoted to the slide title. Reveals use the stage's step machinery: the
 * deck model's step table of the original slide, at the stage's step. The blocks zoom down (to a floor) when they would not fit
 * the canvas. Texuli's `--tx-*` tokens feed Protoyard's blocks, so they follow the deck
 * theme, the slide theme and the background's text color.
 */
let { slide, context }: DeckSlideRendererProps<FreeSlideModel> = $props();
const host = getDeckHostContext();
const fromContext = getDeckStepContext();
const stageStep = $derived(fromContext ?? context.step);
const original = $derived(host.freeSlides.get(slide.id));
// The deck passed DeckSchema (@protoyard/blocks) before it reached DeckApp.
const blocks = $derived((original?.blocks ?? []) as Block[]);
const steps = $derived(original ? deckSlideSteps(original as unknown as DeckSlide) : null);
const step = createDeckStepContext(() => ({
  slide: (original ?? slide) as unknown as DeckSlide,
  steps: steps ?? stageStep.steps,
  step: stageStep.step,
  active: stageStep.active,
  direction: stageStep.direction,
}));
const lead = $derived(
  blocks[0]?.type === 'heading' && blocks[0].step === undefined ? blocks[0] : null
);
const start = $derived(lead ? 1 : 0);
</script>

<div class="py-deck-free" data-py-deck-free={slide.id}>
  {#if lead && lead.type === 'heading'}
    <header class="py-deck-free__heading" data-slot="heading">
      {#if lead.eyebrow}<p class="py-deck-free__eyebrow">{lead.eyebrow}</p>{/if}
      <h2 class="py-deck-free__title" data-slot="title" {@attach fitText(40)}>{lead.text}</h2>
      {#if lead.subtitle}<p class="py-deck-free__subtitle">{lead.subtitle}</p>{/if}
    </header>
  {/if}
  <!-- Safe centering: content taller than the slot starts at the top, under the heading. -->
  <div class="py-deck-free__blocks" data-slot="blocks" {@attach fitContent()}>
    {#each blocks.slice(start) as block, offset (start + offset)}
      <FreeBlock {block} index={start + offset} {step} />
    {/each}
  </div>
</div>

<style>
  .py-deck-free {
    /* Text on the slide follows the background's ink (`--tx-deck-bg-text`). */
    --deck-free-foreground: var(--tx-deck-bg-text, var(--tx-foreground));
    /*
     * The deck's radius choice: the stage writes it to --tx-deck-radius only,
     * so Texuli components on the slide (buttons, cards, inputs) would keep the
     * theme radius.
     */
    --tx-radius: var(--tx-deck-radius);
    --color-foreground: var(--deck-free-foreground);
    --color-border: var(--tx-border);
    --color-primary: var(--tx-primary);
    --color-muted-foreground: var(--tx-muted-foreground);
    --font-sans: var(--tx-font-sans);
    --font-heading: var(--tx-font-heading);
    /* One frame over the slide body, as the stage's layout frames: a fixed box the content fits in. */
    position: absolute;
    inset: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 30px;
    box-sizing: border-box;
    padding-block: 64px;
    padding-inline: 77px;
    color: var(--deck-free-foreground);
    font-family: var(--tx-font-sans);
    font-size: 24px;
  }

  .py-deck-free__heading {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 10px;
  }

  .py-deck-free__eyebrow {
    margin: 0;
    color: var(--tx-primary);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .py-deck-free__title {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    font-family: var(--tx-font-heading);
    font-size: 56px;
    font-weight: 700;
    line-height: 1.1;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .py-deck-free__subtitle {
    margin: 0;
    color: var(--tx-muted-foreground);
    font-size: 28px;
  }

  .py-deck-free__blocks {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: safe center;
    gap: 26px;
    min-block-size: 0;
  }
</style>
