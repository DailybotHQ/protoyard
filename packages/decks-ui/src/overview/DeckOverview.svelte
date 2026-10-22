<script lang="ts">
import { type DeckAspect, deckCanvasSize, slidePositionCount } from '@protoyard/decks';
import type { DeckSlide } from '@protoyard/decks/schema';
import { onMount, tick } from 'svelte';
import { DeckLayoutRenderer } from '../layouts/index.ts';
import SlideStepHost from '../layouts/SlideStepHost.svelte';
import DeckSlideFrame from '../style/DeckSlideFrame.svelte';
import {
  isOverviewNavKey,
  moveOverviewSelection,
  OVERVIEW_WINDOW_RADIUS,
  overviewColumns,
  overviewWindow,
} from './window.ts';

/**
 * Slide overview grid (O). Renders scaled layout thumbnails with every step
 * visible, windowed for large decks. Arrow keys move the selection; Enter
 * opens the slide once; Escape is left to the host (closes without advancing).
 */
let {
  slides,
  activeSlideId = '',
  aspect = '16:9',
  onSelect,
  onClose,
}: {
  slides: readonly DeckSlide[];
  /** Currently open slide id (initial selection). */
  activeSlideId?: string;
  aspect?: DeckAspect;
  /** Called once when the user confirms a thumbnail (click or Enter). */
  onSelect: (slideId: string) => void;
  /** Optional Escape handler when the overview owns focus. */
  onClose?: () => void;
} = $props();

const size = $derived(deckCanvasSize(aspect));
/** Thumbnail scale: fit a ~280px-wide card. */
const thumbScale = $derived(Math.min(0.22, 280 / size.width));

let rootEl = $state<HTMLDivElement | undefined>();
let containerWidth = $state(800);
let selectedIndex = $state(0);
let selectedOnce = $state(false);

const columns = $derived(overviewColumns(containerWidth));
const total = $derived(slides.length);
const windowRange = $derived(overviewWindow(selectedIndex, total, OVERVIEW_WINDOW_RADIUS));

$effect(() => {
  const at = slides.findIndex((slide) => slide.id === activeSlideId);
  selectedIndex = at >= 0 ? at : 0;
});

function layoutPropsFor(slide: DeckSlide): { layout: string; props: unknown } {
  if (slide.layout === 'free') {
    return { layout: 'free', props: { blocks: 'blocks' in slide ? slide.blocks : [] } };
  }
  return {
    layout: slide.layout,
    props: 'props' in slide ? slide.props : {},
  };
}

function stepCountFor(slide: DeckSlide): number {
  return slidePositionCount(slide);
}

function select(index: number): void {
  if (selectedOnce) return;
  const slide = slides[index];
  if (!slide) return;
  selectedOnce = true;
  onSelect(slide.id);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    onClose?.();
    return;
  }
  if (!isOverviewNavKey(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Enter' || event.key === ' ') {
    select(selectedIndex);
    return;
  }
  selectedIndex = moveOverviewSelection(selectedIndex, event.key, total, columns);
  void tick().then(() => {
    const id = slides[selectedIndex]?.id ?? '';
    if (!id || !rootEl) return;
    const nodes = rootEl.querySelectorAll<HTMLElement>('[data-py-deck-overview-item]');
    for (const node of nodes) {
      if (node.getAttribute('data-py-deck-overview-item') === id) {
        node.focus();
        break;
      }
    }
  });
}

onMount(() => {
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) containerWidth = rect.width;
  });
  if (rootEl) {
    observer.observe(rootEl);
    containerWidth = rootEl.clientWidth || 800;
  }
  // Focus the selected thumbnail so arrows work without an extra Tab.
  void tick().then(() => {
    const id = slides[selectedIndex]?.id;
    if (id && rootEl) {
      const nodes = rootEl.querySelectorAll<HTMLElement>('[data-py-deck-overview-item]');
      for (const node of nodes) {
        if (node.getAttribute('data-py-deck-overview-item') === id) {
          node.focus();
          return;
        }
      }
    }
    rootEl?.focus();
  });
  return () => observer.disconnect();
});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={rootEl}
  class="absolute inset-0 z-30 overflow-auto bg-background/95 p-4 backdrop-blur outline-none"
  data-py-deck-overview
  data-py-deck-overview-root
  role="dialog"
  aria-modal="true"
  aria-label="Slide overview"
  tabindex="-1"
  onkeydown={onKeyDown}
>
  <p class="mx-auto mb-3 max-w-5xl text-sm text-muted-foreground">
    Arrow keys move · Enter opens · Esc closes
  </p>
  <ul
    class="mx-auto grid max-w-5xl gap-3"
    style={`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`}
    data-py-deck-overview-grid
    data-columns={columns}
  >
    {#each slides as slide, index (slide.id)}
      {@const inWindow = index >= windowRange.start && index < windowRange.end}
      {@const layout = layoutPropsFor(slide)}
      {@const steps = stepCountFor(slide)}
      {@const selected = index === selectedIndex}
      <li>
        <button
          type="button"
          class="flex w-full flex-col gap-2 rounded-lg border bg-card p-2 text-left shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          class:border-primary={selected}
          class:ring-2={selected}
          class:ring-primary={selected}
          class:border-border={!selected}
          data-py-deck-overview-item={slide.id}
          data-selected={selected ? 'true' : undefined}
          aria-current={selected ? 'true' : undefined}
          aria-label={`Slide ${index + 1}${slide.title ? `: ${slide.title}` : ''}`}
          onclick={(event) => {
            // Stop the deck root click-to-advance (overview-open already
            // guards, but stopPropagation keeps a single navigation).
            event.stopPropagation();
            selectedIndex = index;
            select(index);
          }}
        >
          <span class="px-1 text-xs text-muted-foreground">{index + 1}</span>
          <div
            class="relative w-full overflow-hidden rounded-md border border-border bg-background"
            style={`aspect-ratio: ${size.width} / ${size.height};`}
            data-py-deck-overview-thumb={slide.id}
          >
            {#if inWindow}
              <div
                class="pointer-events-none absolute top-0 left-0 origin-top-left"
                style={`width:${size.width}px;height:${size.height}px;transform:scale(${thumbScale});--py-deck-step:${steps - 1};--py-deck-step-count:${steps}`}
                data-step={steps - 1}
                data-step-count={steps}
              >
                <DeckSlideFrame background={slide.background} number={index + 1}>
                  <SlideStepHost {slide} step={steps - 1}>
                    <DeckLayoutRenderer layout={layout.layout as never} props={layout.props} />
                  </SlideStepHost>
                </DeckSlideFrame>
              </div>
            {:else}
              <div
                class="grid size-full place-items-center text-xs text-muted-foreground"
                aria-hidden="true"
              >
                …
              </div>
            {/if}
          </div>
          <span class="truncate px-1 text-sm font-medium text-foreground">
            {slide.title ?? slide.id}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>
