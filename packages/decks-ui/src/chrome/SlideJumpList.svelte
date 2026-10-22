<script lang="ts">
import type { DeckSlide } from '@protoyard/decks/schema';

/**
 * The slide counter's list of slides: each title (or its layout's title, else
 * the id) as an option. Loaded on its own chunk the first time the list opens.
 * Focus starts on the current slide; arrows, Home and End move it, Enter picks
 * and Escape closes. The keys it handles never reach the deck.
 */
let {
  slides,
  currentOrdinal,
  onselect,
  onclose,
}: {
  slides: readonly DeckSlide[];
  currentOrdinal: number;
  onselect: (slideId: string) => void;
  onclose: () => void;
} = $props();

let list = $state<HTMLDivElement>();

function options(): HTMLButtonElement[] {
  return [...(list?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
}

$effect(() => {
  options()[currentOrdinal - 1]?.focus();
});

function onkeydown(event: KeyboardEvent): void {
  const all = options();
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'ArrowDown'
      ? Math.min(at + 1, all.length - 1)
      : event.key === 'ArrowUp'
        ? Math.max(at - 1, 0)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? all.length - 1
            : null;
  if (next === null && event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  if (next === null) onclose();
  else all[next]?.focus();
}

/** A catalog slide's `title` prop (a custom slide's props are its component and data). */
function propsTitle(slide: DeckSlide): string | null {
  if (!('props' in slide)) return null;
  const title = (slide.props as Record<string, unknown>).title;
  return typeof title === 'string' ? title : null;
}
</script>

<div bind:this={list} id="py-deck-slide-list" style="bottom: 4rem" class="fixed right-3 z-50 max-h-[min(60vh,28rem)] w-64 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg" role="listbox" aria-label="Choose a slide" data-py-deck-slide-list tabindex="-1" {onkeydown}>
  {#each slides as slide, index (slide.id)}
    <button
      type="button"
      role="option"
      aria-selected={index + 1 === currentOrdinal}
      tabindex={index + 1 === currentOrdinal ? 0 : -1}
      class="block min-h-11 w-full rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      onclick={() => onselect(slide.id)}
    >
      <span class="mr-1 text-muted-foreground">{index + 1}.</span>{slide.title ?? propsTitle(slide) ?? slide.id}
    </button>
  {/each}
</div>
