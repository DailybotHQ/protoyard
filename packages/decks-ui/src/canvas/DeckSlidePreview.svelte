<script lang="ts">
import { type DeckAspect, deckCanvasSize, slidePositionCount } from '@protoyard/decks';
import type { DeckSlide } from '@protoyard/decks/schema';
import { onMount } from 'svelte';
import { DeckLayoutRenderer } from '../layouts/index.ts';
import SlideStepHost from '../layouts/SlideStepHost.svelte';
import DeckSlideFrame from '../style/DeckSlideFrame.svelte';
import { fitDeckCanvas } from './fit.ts';

/**
 * A live, inert miniature of one slide: the same layout renderer and slide
 * frame as the canvas, scaled to the width it is given, with every step shown.
 * Used by the presenter's "Next" panel. Not focusable and hidden from
 * assistive tech (the panel names the slide in text).
 */
let {
  slide,
  aspect = '16:9',
  number,
  label,
}: {
  slide: DeckSlide;
  aspect?: DeckAspect;
  /** 1-based number among visible slides, for the frame's slide number. */
  number?: number;
  /** Accessible description of the panel the preview sits in. */
  label?: string;
} = $props();

let box: HTMLDivElement;
let width = $state(0);
const size = $derived(deckCanvasSize(aspect));
const fit = $derived(fitDeckCanvas({ width, height: (width * size.height) / size.width }, size));
const steps = $derived(slidePositionCount(slide));
const layout = $derived(
  slide.layout === 'free'
    ? { layout: 'free', props: { blocks: 'blocks' in slide ? slide.blocks : [] } }
    : { layout: slide.layout, props: 'props' in slide ? slide.props : {} }
);

onMount(() => {
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) width = rect.width;
  });
  observer.observe(box);
  return () => observer.disconnect();
});
</script>

<div
  bind:this={box}
  class="relative w-full overflow-hidden rounded-lg border border-border bg-muted"
  style={`aspect-ratio:${size.width} / ${size.height}`}
  data-py-deck-preview={slide.id}
  data-scale={fit.scale}
  aria-label={label}
  role={label ? 'img' : undefined}
>
  <div
    class="pointer-events-none absolute top-0 left-0 origin-top-left bg-background text-foreground"
    style={`width:${size.width}px;height:${size.height}px;transform:scale(${fit.scale});visibility:${fit.scale > 0 ? 'visible' : 'hidden'};--py-deck-step:${steps - 1};--py-deck-step-count:${steps}`}
    data-step={steps - 1}
    data-step-count={steps}
    aria-hidden="true"
    inert
  >
    <DeckSlideFrame background={slide.background} {number}>
      <SlideStepHost {slide} step={steps - 1}>
        <DeckLayoutRenderer layout={layout.layout as never} props={layout.props} />
      </SlideStepHost>
    </DeckSlideFrame>
  </div>
</div>
