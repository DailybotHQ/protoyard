<script lang="ts">
import { type DeckAspect, deckCanvasSize, slideStepCount } from '@protoyard/decks';
import type { Deck, DeckSlide } from '@protoyard/decks/schema';
import { DeckLayoutRenderer } from '../layouts/index.ts';
import './print.css';

/**
 * One-slide-per-page print layout. Every non-hidden slide is rendered at the
 * virtual canvas size with all steps revealed. Optional speaker notes sit
 * under each page when `notes` is true.
 */
let {
  deck,
  notes = false,
  class: className = '',
}: {
  deck: Deck;
  /** Include `slide.notes` under each page. */
  notes?: boolean;
  class?: string;
} = $props();

const aspect = $derived((deck.style?.aspect ?? '16:9') as DeckAspect);
const canvas = $derived(deckCanvasSize(aspect));
const pages = $derived(deck.slides.filter((slide) => !slide.hidden));

function layoutPropsFor(slide: DeckSlide): {
  layout: string;
  props: Record<string, unknown>;
} {
  if (slide.layout === 'free') {
    return {
      layout: 'free',
      props: { blocks: 'blocks' in slide ? slide.blocks : [] },
    };
  }
  return {
    layout: slide.layout,
    props: 'props' in slide ? (slide.props as Record<string, unknown>) : {},
  };
}

/** Last step index so every fragment is visible on paper. */
function finalStep(slide: DeckSlide): number {
  const count = Math.max(1, slideStepCount(slide));
  return count - 1;
}
</script>

<div
  class={`deck-print ${className}`}
  data-py-deck-print
  data-py-deck-print-notes={notes ? 'true' : 'false'}
  data-aspect={aspect}
  style={`--py-deck-print-width:${canvas.width}px;--py-deck-print-height:${canvas.height}px;`}
  role="document"
  aria-label={`${deck.outline?.title ?? 'Presentation'} (print)`}
>
  {#if pages.length === 0}
    <p class="p-6 text-sm text-muted-foreground" role="note">This deck has no slides to print.</p>
  {:else}
    {#each pages as slide, index (slide.id)}
      {@const layout = layoutPropsFor(slide)}
      {@const step = finalStep(slide)}
      {@const stepCount = Math.max(1, slideStepCount(slide))}
      <section
        class="deck-print__page"
        data-py-deck-print-page
        data-py-deck-slide={slide.id}
        data-slide-index={index}
        data-step={step}
        data-step-count={stepCount}
        style={`--py-deck-step:${step};--py-deck-step-count:${stepCount};`}
        aria-label={slide.title ?? `Slide ${index + 1}`}
      >
        <div
          class="deck-print__canvas"
          data-py-deck-print-canvas
          data-testid="deck-print-canvas"
        >
          <div
            class="deck-print__slide size-full"
            data-py-deck-slide-inner={slide.id}
          >
            <DeckLayoutRenderer layout={layout.layout as never} props={layout.props} />
          </div>
        </div>
      </section>
      {#if notes && slide.notes?.trim()}
        <aside
          class="deck-print__notes"
          data-py-deck-print-notes-block
          data-py-deck-print-notes
          aria-label={`Notes for ${slide.title ?? slide.id}`}
        >
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes · {slide.title ?? slide.id}
          </p>
          <p class="whitespace-pre-wrap text-sm text-foreground">{slide.notes}</p>
        </aside>
      {/if}
    {/each}
  {/if}
</div>
