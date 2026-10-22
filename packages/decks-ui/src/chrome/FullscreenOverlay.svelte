<script lang="ts">
import { deckControlFor } from '@protoyard/decks';
import { type DeckFullscreenMode, FULLSCREEN_OVERLAY_IDLE_MS } from './fullscreen.ts';
import { DECK_ICON_PATHS } from './icons.ts';

/**
 * The way out of full screen: leave, previous, the slide counter and next.
 * It shows when the deck enters full screen and on every pointer move or
 * touch over the deck, stays while the pointer or keyboard focus is on it,
 * and fades after 2.5 s. While hidden it is inert, so it never takes a click
 * or a Tab stop meant for the slide. Laser and blackout suppress it.
 */
let {
  mode,
  counter,
  container,
  suppressed = false,
  onaction,
}: {
  mode: DeckFullscreenMode;
  /** "3 / 12". */
  counter: string;
  /** The deck root: pointer moves and touches over it show the overlay. */
  container: HTMLElement | undefined;
  suppressed?: boolean;
  onaction: (action: 'fullscreen-exit' | 'prev' | 'next') => void;
} = $props();

const exitControl = deckControlFor('fullscreen-exit');
const prevControl = deckControlFor('prev');
const nextControl = deckControlFor('next');

let shown = $state(true);
let held = $state(false);
let node = $state<HTMLDivElement | undefined>();
let timer: ReturnType<typeof setTimeout> | undefined;

function wake(): void {
  shown = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!held) shown = false;
  }, FULLSCREEN_OVERLAY_IDLE_MS);
}

$effect(() => {
  const target = container;
  wake();
  if (!target) return;
  target.addEventListener('pointermove', wake);
  target.addEventListener('pointerdown', wake);
  return () => {
    target.removeEventListener('pointermove', wake);
    target.removeEventListener('pointerdown', wake);
    clearTimeout(timer);
  };
});

const visible = $derived(shown && !suppressed);

function release(): void {
  held = Boolean(node?.matches(':hover') || node?.contains(document.activeElement));
  if (!held) wake();
}

const buttonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
</script>

{#snippet icon(paths: readonly string[])}
  <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    {#each paths as path (path)}<path d={path}></path>{/each}
  </svg>
{/snippet}

<div
  bind:this={node}
  class={`absolute inset-x-0 bottom-4 z-30 flex justify-center px-4 transition-opacity duration-200 ${visible ? '' : 'pointer-events-none opacity-0'}`}
  inert={!visible}
  data-py-deck-chrome
  data-py-deck-fullscreen-overlay
  data-visible={visible ? 'true' : 'false'}
>
  <div
    class="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
    role="toolbar"
    aria-label="Full screen controls"
    tabindex="-1"
    onpointerenter={() => (held = true)}
    onpointerleave={release}
    onfocusin={() => (held = true)}
    onfocusout={() => queueMicrotask(release)}
  >
    <button
      type="button"
      class={buttonClass}
      aria-label={exitControl.label}
      aria-keyshortcuts="Escape F"
      data-py-deck-fullscreen-exit
      onclick={() => onaction('fullscreen-exit')}
    >
      {@render icon(DECK_ICON_PATHS[exitControl.icon])}
      <span>{exitControl.label}</span>
    </button>
    <button type="button" class={buttonClass} aria-label={prevControl.label} onclick={() => onaction('prev')}>
      {@render icon(DECK_ICON_PATHS[prevControl.icon])}
    </button>
    <span class="min-w-14 px-2 text-center text-sm font-medium tabular-nums text-muted-foreground" data-py-deck-fullscreen-counter>{counter}</span>
    <button type="button" class={buttonClass} aria-label={nextControl.label} onclick={() => onaction('next')}>
      {@render icon(DECK_ICON_PATHS[nextControl.icon])}
    </button>
    {#if mode === 'window'}
      <p class="basis-full px-2 pb-1 text-center text-xs text-muted-foreground" data-py-deck-fullscreen-mode-note>
        Filling this window: this page cannot use the browser’s full screen.
      </p>
    {/if}
  </div>
</div>
