<script lang="ts">
import type { CustomSlide as Slide } from '@protoyard/decks/schema';
import type { CustomSlide } from '@texuli/deck/model';
import { type DeckSlideRendererProps, getDeckStepContext } from '@texuli/slides/stage';
import CustomSlideHost from '../layouts/CustomSlideHost.svelte';
import { getDeckHostContext } from './context.ts';

/**
 * A `layout: "custom"` slide on the `@texuli/slides` stage: the generated
 * deck's own component (DeckApp's `customSlides`), or a labelled card in the
 * player. Overview thumbnails, presenter previews and print show the card and
 * never run owned code (the stage paints them with the same renderers, so
 * the slide checks where it was mounted).
 */
let { slide, context }: DeckSlideRendererProps<CustomSlide> = $props();
const host = getDeckHostContext();
const fromContext = getDeckStepContext();
const step = $derived(fromContext ?? context.step);
/** Unknown until mounted; a preview or print page never turns live. */
let live = $state(false);

function placement(node: HTMLElement): void {
  live = node.closest('[data-tx-deck-preview], .tx-deck-print-view') === null;
}
</script>

<div class="absolute inset-0 overflow-hidden" {@attach placement}>
  <CustomSlideHost
    slide={slide as unknown as Slide}
    step={step.step}
    stepCount={step.count}
    registry={host.customSlides}
    {live}
  />
</div>
