<script lang="ts">
import type { DeckSlide } from '@protoyard/decks/schema';

/**
 * The slide counter's list of slides: each title (or its layout's title, else
 * the id) as an option. Loaded on its own chunk the first time the list opens.
 */
let {
  slides,
  currentOrdinal,
  onselect,
}: {
  slides: readonly DeckSlide[];
  currentOrdinal: number;
  onselect: (slideId: string) => void;
} = $props();

/** A catalog slide's `title` prop (a custom slide's props are its component and data). */
function propsTitle(slide: DeckSlide): string | null {
  if (!('props' in slide)) return null;
  const title = (slide.props as Record<string, unknown>).title;
  return typeof title === 'string' ? title : null;
}
</script>

<div id="py-deck-slide-list" style="bottom: 4rem" class="fixed right-3 z-50 max-h-[min(60vh,28rem)] w-64 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg" role="listbox" aria-label="Choose a slide" data-py-deck-slide-list>
  {#each slides as slide, index (slide.id)}
    <button
      type="button"
      role="option"
      aria-selected={index + 1 === currentOrdinal}
      class="block min-h-11 w-full rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      onclick={() => onselect(slide.id)}
    >
      <span class="mr-1 text-muted-foreground">{index + 1}.</span>{slide.title ?? propsTitle(slide) ?? slide.id}
    </button>
  {/each}
</div>
