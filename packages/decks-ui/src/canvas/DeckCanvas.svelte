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

<div
  bind:this={viewportElement}
  role="region"
  aria-label={label}
  class="relative grid size-full place-items-center overflow-hidden bg-background"
>
  <div
    data-testid="deck-canvas"
    data-scale={fit.scale}
    class="relative shrink-0 origin-center overflow-hidden bg-background text-foreground"
    style={`width:${size.width}px;height:${size.height}px;transform:scale(${fit.scale});visibility:${fit.scale > 0 ? 'visible' : 'hidden'}`}
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
