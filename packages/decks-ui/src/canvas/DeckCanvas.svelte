<script lang="ts" generics="T extends CanvasSlide">
import { type DeckAspect, deckCanvasSize } from '@protoyard/decks';
import { onMount, type Snippet } from 'svelte';
import { fitDeckCanvas } from './fit.ts';

interface CanvasSlide {
  id: string;
  title?: string;
}

interface Props<T extends CanvasSlide> {
  slides: readonly T[];
  activeIndex: number;
  aspect?: DeckAspect;
  label?: string;
  children: Snippet<[slide: T, index: number]>;
}

let { slides, activeIndex, aspect = '16:9', label = 'Presentation', children }: Props<T> = $props();

let viewportElement: HTMLDivElement;
let viewport = $state({ width: 0, height: 0 });
const size = $derived(deckCanvasSize(aspect));
const fit = $derived(fitDeckCanvas(viewport, size));
const currentIndex = $derived(
  slides.length === 0
    ? -1
    : Number.isFinite(activeIndex)
      ? Math.min(slides.length - 1, Math.max(0, Math.trunc(activeIndex)))
      : 0
);
const firstIndex = $derived(Math.max(0, currentIndex - 1));
const visibleSlides = $derived(
  currentIndex < 0
    ? []
    : slides
        .slice(firstIndex, Math.min(slides.length, currentIndex + 2))
        .map((slide, offset) => ({ slide, index: firstIndex + offset }))
);

onMount(() => {
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) viewport = { width: rect.width, height: rect.height };
  });
  observer.observe(viewportElement);
  return () => observer.disconnect();
});
</script>

<!--
  The stage fills its positioned parent and letterboxes in the theme's muted
  token. The canvas is taken out of the flow (absolute, top-left origin) and
  placed at the fitted offsets, so its 1280-px layout box can never grow the
  stage: the fit always comes from the space the host leaves.
-->
<div
  bind:this={viewportElement}
  role="region"
  aria-label={label}
  class="absolute inset-0 overflow-hidden bg-muted"
  data-py-deck-stage
>
  <div
    data-testid="deck-canvas"
    data-scale={fit.scale}
    data-offset-x={Math.round(fit.offsetX)}
    data-offset-y={Math.round(fit.offsetY)}
    class="absolute top-0 left-0 origin-top-left overflow-hidden bg-background text-foreground shadow-float"
    style={`width:${size.width}px;height:${size.height}px;transform:translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale});visibility:${fit.scale > 0 ? 'visible' : 'hidden'}`}
  >
    {#each visibleSlides as entry (entry.slide.id)}
      {@const isActive = entry.index === currentIndex}
      <div
        data-canvas-slide={entry.index}
        role="group"
        aria-roledescription="slide"
        aria-label={`${entry.index + 1} of ${slides.length}${entry.slide.title ? `: ${entry.slide.title}` : ''}`}
        aria-hidden={!isActive}
        inert={!isActive}
        class="absolute inset-0 size-full overflow-hidden"
        class:invisible={!isActive}
        class:pointer-events-none={!isActive}
      >
        {@render children(entry.slide, entry.index)}
      </div>
    {/each}
  </div>
</div>
