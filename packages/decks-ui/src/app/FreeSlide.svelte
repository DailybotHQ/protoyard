<script lang="ts">
import type { Block } from '@protoyard/blocks';
import type { DeckSlide, FreeSlide } from '@texuli/deck/model';
import { fitText } from '@texuli/slides/layouts';
import {
  createDeckStepContext,
  type DeckSlideRendererProps,
  deckSlideSteps,
  getDeckStepContext,
} from '@texuli/slides/stage';
import { getDeckHostContext } from './context.ts';
import FreeBlock from './FreeBlock.svelte';
import { fitContent } from './fit.ts';

/**
 * Protoyard's free slide renderer for the `@texuli/slides` stage: the
 * author's `@protoyard/blocks` (the stage checked them with DeckApp's
 * `validateBlock`, see `renderers.ts`), with a leading unstepped heading
 * promoted to the slide title. Reveals use the stage's step machinery: the
 * deck model's step table of the original slide, at the stage's step. The blocks zoom down (to a floor) when they would not fit
 * the canvas. Protoyard's `--py-*` theme tokens are aliased to the stage's
 * `--tx-*` tokens here, so blocks follow the deck theme, the slide theme and
 * the background's text color.
 */
let { slide, context }: DeckSlideRendererProps<FreeSlide> = $props();
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
    /* Protoyard tokens follow the stage theme (every shared --py-<role> equals --tx-<role>). */
    --py-background: var(--tx-background);
    --py-foreground: var(--tx-deck-bg-text, var(--tx-foreground));
    --py-surface: var(--tx-surface);
    --py-surface-foreground: var(--tx-surface-foreground);
    --py-elevated: var(--tx-elevated);
    --py-muted: var(--tx-muted);
    --py-muted-foreground: var(--tx-muted-foreground);
    --py-border: var(--tx-border);
    --py-input: var(--tx-input);
    --py-ring: var(--tx-ring);
    --py-primary: var(--tx-primary);
    --py-primary-foreground: var(--tx-primary-foreground);
    --py-secondary: var(--tx-secondary);
    --py-secondary-foreground: var(--tx-secondary-foreground);
    --py-accent: var(--tx-accent);
    --py-accent-foreground: var(--tx-accent-foreground);
    --py-destructive: var(--tx-destructive);
    --py-destructive-foreground: var(--tx-destructive-foreground);
    --py-success: var(--tx-success);
    --py-success-foreground: var(--tx-success-foreground);
    --py-warning: var(--tx-warning);
    --py-warning-foreground: var(--tx-warning-foreground);
    --py-info: var(--tx-info);
    --py-info-foreground: var(--tx-info-foreground);
    --py-font-sans: var(--tx-font-sans);
    --py-font-heading: var(--tx-font-heading);
    --py-font-mono: var(--tx-font-mono);
    --color-foreground: var(--py-foreground);
    --color-border: var(--py-border);
    --color-primary: var(--py-primary);
    --color-muted-foreground: var(--py-muted-foreground);
    --font-sans: var(--py-font-sans);
    --font-heading: var(--py-font-heading);
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
    color: var(--py-foreground);
    font-family: var(--py-font-sans);
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
    color: var(--py-primary);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .py-deck-free__title {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    font-family: var(--py-font-heading);
    font-size: 56px;
    font-weight: 700;
    line-height: 1.1;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .py-deck-free__subtitle {
    margin: 0;
    color: var(--py-muted-foreground);
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
