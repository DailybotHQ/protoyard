<script lang="ts">
/**
 * Presenter chrome: current + next slide titles, notes, elapsed and per-slide
 * timers, and position. Used in a popup window or the in-page split fallback.
 */
import type { Deck, DeckSlide } from '@protoyard/decks/schema';
import { onDestroy, onMount } from 'svelte';

let {
  deck,
  slideId,
  step = 0,
  stepCount = 1,
  onNavigate,
}: {
  deck: Deck;
  slideId: string;
  step?: number;
  stepCount?: number;
  onNavigate?: (action: 'next' | 'prev' | 'first' | 'last') => void;
} = $props();

const slides = $derived(deck.slides.filter((s) => s.hidden !== true));
const index = $derived(
  Math.max(
    0,
    slides.findIndex((s) => s.id === slideId)
  )
);
const current = $derived(slides[index] as DeckSlide | undefined);
const nextSlide = $derived(slides[index + 1] as DeckSlide | undefined);
const positionLabel = $derived(slides.length === 0 ? '0 / 0' : `${index + 1} / ${slides.length}`);

let elapsedMs = $state(0);
let slideMs = $state(0);
let startedAt = 0;
let slideStartedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

onMount(() => {
  startedAt = Date.now();
  slideStartedAt = startedAt;
  timer = setInterval(() => {
    const now = Date.now();
    elapsedMs = now - startedAt;
    slideMs = now - slideStartedAt;
  }, 250);
  return () => {
    if (timer) clearInterval(timer);
  };
});

onDestroy(() => {
  if (timer) clearInterval(timer);
});

// Reset per-slide timer when the slide changes.
$effect(() => {
  slideId;
  step;
  slideStartedAt = Date.now();
  slideMs = 0;
});

function notesOf(slide: DeckSlide | undefined): string {
  if (!slide) return '';
  return typeof slide.notes === 'string' ? slide.notes : '';
}
</script>

<div
  class="deck-presenter grid size-full min-h-0 gap-4 bg-background p-4 text-foreground"
  data-py-deck-presenter
  data-slide-id={slideId}
  data-slide-step={step}
>
  <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
    <div class="grid gap-0.5">
      <p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Presenter</p>
      <p class="text-sm font-medium" data-py-presenter-position>{positionLabel}</p>
    </div>
    <div class="flex gap-4 text-sm tabular-nums" data-py-presenter-timers>
      <p>
        <span class="text-muted-foreground">Elapsed</span>
        <span class="ml-2 font-semibold" data-py-presenter-elapsed>{formatMs(elapsedMs)}</span>
      </p>
      <p>
        <span class="text-muted-foreground">Slide</span>
        <span class="ml-2 font-semibold" data-py-presenter-slide-time>{formatMs(slideMs)}</span>
      </p>
    </div>
    {#if onNavigate}
      <div class="flex gap-2" data-py-presenter-nav>
        <button
          type="button"
          class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          onclick={() => onNavigate('prev')}>Previous</button
        >
        <button
          type="button"
          class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          onclick={() => onNavigate('next')}>Next</button
        >
      </div>
    {/if}
  </header>

  <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
    <section class="grid min-h-0 gap-2 rounded-xl border border-border bg-card p-4" aria-label="Current slide">
      <p class="text-xs font-semibold text-muted-foreground uppercase">Now</p>
      <h2 class="text-xl font-semibold" data-py-presenter-current-title>
        {current?.title ?? current?.id ?? '—'}
      </h2>
      <p class="text-xs text-muted-foreground" data-py-presenter-step>
        Step {step + 1} of {Math.max(1, stepCount)}
      </p>
      <div
        class="min-h-0 flex-1 overflow-auto rounded-lg bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap"
        data-py-presenter-notes
      >
        {notesOf(current) || 'No speaker notes for this slide.'}
      </div>
    </section>

    <section class="grid min-h-0 gap-2 rounded-xl border border-border bg-card p-4" aria-label="Next slide">
      <p class="text-xs font-semibold text-muted-foreground uppercase">Next</p>
      {#if nextSlide}
        <h2 class="text-lg font-semibold" data-py-presenter-next-title>{nextSlide.title ?? nextSlide.id}</h2>
        <p class="text-sm text-muted-foreground whitespace-pre-wrap" data-py-presenter-next-notes>
          {notesOf(nextSlide) || 'No notes.'}
        </p>
      {:else}
        <p class="text-sm text-muted-foreground" data-py-presenter-next-title>End of deck</p>
      {/if}
    </section>
  </div>
</div>
