<script lang="ts">
import '@texuli/slides/styles.css';
import { checkProtoyardDeck } from '@protoyard/decks';
import type { AgentReferenceSource } from '@protoyard/decks/agent';
import type { Deck } from '@protoyard/decks/schema';
import type { DeckStyleWarning } from '@protoyard/decks/style';
import { deckThemeKey } from '@protoyard/decks/style/key';
import {
  type DeckController,
  formatDeckHash,
  parseDeckHash,
  parseDeckRoute,
} from '@texuli/deck/engine';
import { DeckProgress, DeckStage, type DeckThemeLoader, DeckToolbar } from '@texuli/slides/stage';
import { flushSync, onMount, untrack } from 'svelte';
import { type DeckDebugSetting, deckDebugAvailable, isDevBuild } from '../debug/availability.ts';
import type { CustomSlideRegistry } from '../layouts/custom-slides.ts';
import { setDeckHostContext } from './context.ts';
import { createProtoyardRenderers } from './renderers.ts';
import { stageDeck as toStageDeck } from './stage-deck.ts';

/**
 * The one deck component the player's deck entry and generated deck
 * prototypes mount (ADR-038), presented by the `@texuli/slides` stage
 * (`DeckStage`, Texuli ADR-009). The stage owns the canvas, routing
 * (`#/<slide-id>/<step>`), keys, touch, the toolbar, overview, presenter,
 * blackout, laser, help, copy link, print and transitions. DeckApp adds what
 * is Protoyard's own:
 *
 * - the Protoyard deck shape, migrated to the Texuli deck model;
 * - Protoyard themes, palette seeds and font pairings (`@protoyard/themes`);
 * - free slides through `@protoyard/blocks-ui` (persistent block state,
 *   embedded apps, the viewer id) and the generated deck's custom slides;
 * - the "Debug for agents" panel (D, or its toolbar button) and the print
 *   page for `?print=1`.
 */
let {
  deck,
  class: className = '',
  syncHash = true,
  autofocus = true,
  namespace = 'deck',
  mode = 'light',
  fit = 'viewport',
  debug = 'auto',
  debugSource = null,
  customSlides,
  resolveAvatar,
}: {
  /** Validated deck document (`DeckSchema`). */
  deck: Deck;
  class?: string;
  /** When true (default), keep `location.hash` in sync with the slide and step. */
  syncHash?: boolean;
  /** Focus the active slide on mount so keyboard navigation works immediately. */
  autofocus?: boolean;
  /** Presenter channel, view-transition and first-visit hint namespace. */
  namespace?: string;
  /** Appearance mode for the deck's theme. Decks default to light for stable exports. */
  mode?: 'light' | 'dark';
  /**
   * `viewport` (default): the deck takes the app height (`h-app`: the window,
   * or the device screen inside a shell frame). `container`: it fills a parent
   * the host has already sized.
   */
  fit?: 'viewport' | 'container';
  /**
   * The "Debug for agents" panel: `auto` (default) in dev builds or with
   * `?debug=1`; `on` always; `off` never.
   */
  debug?: DeckDebugSetting;
  /** Where the deck came from, for the agent reference (a blueprint path, a prototype slug). */
  debugSource?: AgentReferenceSource | null;
  /**
   * A generated deck's own slide components (`src/custom-slides.ts`), for
   * `layout: "custom"` slides. Without it (the player) they show a labelled card.
   */
  customSlides?: CustomSlideRegistry;
  /** Resolves a library avatar id (`av-012`) to its image URL (team and people slides). */
  resolveAvatar?: (id: string) => string | undefined;
} = $props();

const stage = $derived(toStageDeck(deck));
const renderers = $derived(createProtoyardRenderers(stage.freeSlides));

setDeckHostContext({
  get customSlides() {
    return customSlides;
  },
  get freeSlides() {
    return stage.freeSlides;
  },
});

/** The deck the stage presents, migrated to the deck model and validated by `@texuli/deck`. */
const checked = $derived(checkProtoyardDeck(stage.input));
const stageDeck = $derived(checked.deck ?? stage.input);

let styleWarnings = $state<DeckStyleWarning[]>([]);
const loadTheme: DeckThemeLoader = async (id) => {
  // The theme registry and the palette engine load with the first theme, off the deck entry.
  const { loadDeckTheme } = await import('@protoyard/decks/style');
  const loaded = await loadDeckTheme(id, deck.style?.fontPair);
  styleWarnings = loaded.warnings;
  return loaded.theme as unknown as Awaited<ReturnType<DeckThemeLoader>>;
};

const debugAvailable = $derived(
  deckDebugAvailable(debug, {
    dev: isDevBuild(),
    search: typeof window === 'undefined' ? '' : window.location.search,
  })
);
let debugOpen = $state(false);
let presenterOpen = $state(false);
let rootEl = $state<HTMLDivElement | undefined>();
let controller = $state.raw<DeckController | null>(null);
let slideId = $state(untrack(() => deck.slides[0]?.id ?? ''));
let step = $state(0);

const route = typeof window === 'undefined' ? null : parseDeckRoute('', window.location.search);
const printing = route?.flags.print === true;
/** The browser's own print (Ctrl/Cmd+P): the one-slide-per-page view replaces the stage on paper. */
let printSheet = $state(false);
let exporter = $state.raw<typeof import('@texuli/slides/export') | null>(null);
const printNotes = route?.flags.notes === true ? 'appendix' : 'none';

// The host attributes (`data-slide-id`, `data-slide-step`) and the debug panel follow the
// stage's controller: its first position (a deep link) and every move after it.
$effect(() => {
  const stage = controller;
  if (!stage) return;
  const follow = (state: { slideId: string; step: number }) => {
    slideId = state.slideId;
    step = state.step;
  };
  follow(stage.getState());
  return stage.subscribe((state) => follow(state));
});

function toggleDebug(): void {
  if (!debugAvailable) return;
  debugOpen = !debugOpen;
}

function jumpToSlide(id: string): void {
  controller?.goTo(id);
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

/** D toggles the debug panel (where it is available); Esc closes it first, before the stage's layers. */
function onKeyDown(event: KeyboardEvent): void {
  if (!debugAvailable || presenterOpen) return;
  if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
  if (event.key === 'd' || event.key === 'D') {
    event.preventDefault();
    toggleDebug();
  } else if (event.key === 'Escape' && debugOpen) {
    // The panel is the innermost layer: Esc closes it before any stage layer.
    event.preventDefault();
    event.stopImmediatePropagation();
    debugOpen = false;
  }
}

/**
 * A followed hash that names a step past the slide's last one (`#/loop/9`) shows
 * the last step; write that position back so the address bar, a copied link
 * and the presenter agree (the stage clamps the position but keeps the hash).
 */
function canonicalHash(): void {
  const stage = controller;
  if (!syncHash || !stage || typeof window === 'undefined') return;
  const state = stage.getState();
  const asked = parseDeckHash(window.location.hash);
  // Only a step past the slide's last one, once the stage has followed the hash to that slide.
  if (!asked || asked.slideId !== state.slideId || asked.step <= state.stepCount) return;
  const canonical = formatDeckHash(state.slideId, state.step);
  if (window.location.hash !== canonical) history.replaceState(history.state, '', canonical);
}

$effect(() => {
  if (!syncHash || !controller) return;
  // After the stage's own hashchange handling (and a view transition's update).
  const follow = () => setTimeout(canonicalHash, 50);
  follow();
  window.addEventListener('hashchange', follow);
  return () => window.removeEventListener('hashchange', follow);
});

let toast = $state('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function notify(message: string): void {
  toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = '';
  }, 2_500);
}

onMount(() => {
  // The print view loads while the browser is idle, so Ctrl/Cmd+P finds it ready.
  const warm = () => {
    void import('@texuli/slides/export').then(
      (module) => {
        exporter = module;
      },
      () => undefined
    );
  };
  const hasIdle = 'requestIdleCallback' in window;
  const idle = hasIdle
    ? window.requestIdleCallback(warm, { timeout: 4_000 })
    : window.setTimeout(warm, 1_500);
  const beforePrint = () => {
    printSheet = true;
    // The pages must be in the document before the browser captures it.
    flushSync();
  };
  const afterPrint = () => {
    printSheet = false;
  };
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  // Capture: the debug panel answers before the stage's own key handling.
  if (debugAvailable) window.addEventListener('keydown', onKeyDown, true);
  return () => {
    if (hasIdle) window.cancelIdleCallback(idle);
    else window.clearTimeout(idle);
    window.removeEventListener('beforeprint', beforePrint);
    window.removeEventListener('afterprint', afterPrint);
    window.removeEventListener('keydown', onKeyDown, true);
    clearTimeout(toastTimer);
  };
});
</script>

{#if printing}
  <!-- `?print=1` (the stage's print button opens it): one slide per page, ready for Save as PDF. -->
  {#await import('@texuli/slides/export') then exporter}
    <div class="deck-app__print" data-py-deck-print data-tx-mode={mode}>
      <exporter.DeckPrintView
        deck={stageDeck as never}
        notes={printNotes}
        {renderers}
        tier="developer"
        {loadTheme}
        {resolveAvatar}
      />
    </div>
  {/await}
{:else}
  <div
    bind:this={rootEl}
    class={`deck-app relative flex w-full min-h-0 flex-col overflow-hidden bg-background text-foreground ${fit === 'container' ? 'h-full' : 'h-app'} ${className}`}
    data-py-deck-app
    data-py-deck-fit={fit}
    data-slide-id={slideId}
    data-slide-step={step}
    data-presenter={presenterOpen ? 'true' : undefined}
    data-py-deck-print-ready={exporter ? 'true' : undefined}
    data-py-deck-motion={deck.style?.motion ?? 'default'}
    data-py-deck-theme={deckThemeKey(deck.style)}
    data-py-deck-mode={mode}
    data-tx-mode={mode}
  >
    <DeckStage
      deck={stageDeck}
      fit="container"
      tier="developer"
      trustBadge={false}
      {syncHash}
      {autofocus}
      {namespace}
      {loadTheme}
      {resolveAvatar}
      {renderers}
      defaultRenderers={false}
      presenterTimer
      bind:presenter={presenterOpen}
      bind:controller
      chrome={debugAvailable ? debugChrome : undefined}
    />

    {#if styleWarnings.length > 0}
      <p
        class="shrink-0 border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
        role="status"
        data-py-deck-style-warning
      >
        {styleWarnings.map((warning) => warning.message).join(' ')}
      </p>
    {/if}

    {#if debugOpen && debugAvailable && !presenterOpen}
      {#await import('../debug/DeckDebugPanel.svelte')}
        <div class="absolute inset-y-0 right-0 z-40 grid w-full max-w-md place-items-center border-l border-border bg-background" role="status" data-py-deck-debug-loading data-tx-deck-chrome>
          <span class="text-sm text-muted-foreground">Loading the debug panel…</span>
        </div>
      {:then mod}
        <mod.default
          {deck}
          {slideId}
          {step}
          root={rootEl}
          source={debugSource}
          onjump={jumpToSlide}
          onclose={() => {
            debugOpen = false;
          }}
          onnotify={(message) => notify(message)}
        />
      {:catch}
        <div class="absolute inset-y-0 right-0 z-40 grid w-full max-w-md place-items-center border-l border-border bg-background p-6" role="alert" data-tx-deck-chrome>
          <p class="text-sm text-destructive">The debug panel could not be loaded.</p>
        </div>
      {/await}
    {/if}

    {#if printSheet && exporter}
      <!-- Paper only: every visible slide, one per page (the screen keeps the stage). -->
      <div class="deck-app__print-sheet" data-py-deck-print data-tx-mode={mode}>
        <exporter.DeckPrintView
          deck={stageDeck as never}
          {renderers}
          tier="developer"
          {loadTheme}
          {resolveAvatar}
        />
      </div>
    {/if}

    <!-- The debug panel's copy and download results, visible and announced. -->
    <p
      class={`pointer-events-none absolute inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-md rounded-md bg-foreground px-3 py-1.5 text-sm text-background ${toast ? '' : 'sr-only'}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-py-deck-toast
    >
      {toast}
    </p>
  </div>
{/if}

{#snippet debugChrome()}
  <!-- With the debug panel available, the stage toolbar gains its button (the rest is the stage's own). -->
  <div class="deck-app__chrome" data-tx-deck-chrome>
    <DeckProgress />
    <div class="deck-app__tools">
      <DeckToolbar />
      <button
        type="button"
        class="deck-app__debug"
        aria-pressed={debugOpen}
        aria-keyshortcuts="D"
        title="Debug for agents (D)"
        data-py-deck-tool="debug"
        onclick={toggleDebug}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
          <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
        </svg>
        <span class="sr-only">Debug for agents</span>
      </button>
    </div>
  </div>
{/snippet}

<style>
  .deck-app :global(.tx-deck-stage) {
    flex: 1;
    min-block-size: 0;
  }

  .deck-app__chrome {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    inline-size: 100%;
  }

  .deck-app__tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
  }

  .deck-app__debug {
    display: inline-grid;
    place-items: center;
    min-inline-size: 2.75rem;
    min-block-size: 2.75rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .deck-app__debug:hover,
  .deck-app__debug[aria-pressed='true'] {
    background: var(--tx-muted, var(--py-muted));
  }

  .deck-app__debug:focus-visible {
    outline: 2px solid var(--tx-ring, var(--py-ring));
    outline-offset: 2px;
  }

  .deck-app__print {
    min-block-size: 100%;
  }

  @media screen {
    .deck-app__print-sheet {
      display: none;
    }
  }
</style>
