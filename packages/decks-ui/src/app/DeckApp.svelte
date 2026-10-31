<script lang="ts">
import '@texuli/slides/styles.css';
import { Bug } from '@lucide/svelte';
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
import { DeckStageCore, type DeckThemeLoader } from '@texuli/slides/stage-core';
import { flushSync, onMount, untrack } from 'svelte';
import { Button, IconButton } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import { type DeckDebugSetting, deckDebugAvailable, isDevBuild } from '../debug/availability.ts';
import type { CustomSlideRegistry } from '../layouts/custom-slides.ts';
import { setDeckHostContext } from './context.ts';
import { createProtoyardRenderers } from './renderers.ts';
import {
  prepareStageDeck,
  stageThemeKey,
  themeKeyOf,
  stageDeck as toStageDeck,
} from './stage-deck.ts';

/**
 * The one deck component the player's deck entry and generated deck
 * prototypes mount (ADR-038), presented by the `@texuli/slides` stage core
 * (`DeckStageCore`, Texuli ADR-009): the stage without its default renderer
 * tables, which a Protoyard deck never uses, so the build emits none of
 * their chunks or CSS. The stage owns the canvas, routing
 * (`#/<slide-id>/<step>`), keys, touch, the toolbar, overview, presenter,
 * blackout, laser, help, copy link, print and transitions. DeckApp adds what
 * is Protoyard's own:
 *
 * - the Protoyard deck shape, migrated to the Texuli deck model and prepared
 *   once (`prepareDeckV2` with Protoyard's block check), so the stage paints
 *   it on its first render without validating it again;
 * - Protoyard themes, palette seeds and font pairings (`@protoyard/themes`);
 * - free slides through `@protoyard/blocks-ui` (persistent block state,
 *   embedded apps, the viewer id) and the generated deck's custom slides;
 * - the "Debug for agents" panel (D, or its button in the stage toolbar's
 *   host tools) and the print page for `?print=1`.
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

/**
 * The deck the stage presents: migrated to the deck model and validated once with
 * Protoyard's block check. A prepared deck at the `developer` tier paints on the
 * stage's first render, with no migration or validation chunk. A deck that does not
 * prepare goes to the stage as it is, which shows its diagnostics instead of slides.
 */
const prepared = $derived(prepareStageDeck(stage.input));
const stageDeck = $derived(prepared.ok ? prepared : stage.input);
/** What the print view paints: the prepared model v2 deck. */
const printDeck = $derived(prepared.ok ? prepared.deck : stage.input);

/**
 * Style warnings per stage theme key. The stage caches loaded themes by key
 * (the key carries the font pair, see `stageThemeKey`), so switching back to a
 * key it already has does not call `loadTheme` again: the banner reads the
 * warnings of the key the deck asks for now.
 */
let warningsByKey = $state<Record<string, DeckStyleWarning[]>>({});
const styleWarnings = $derived(warningsByKey[stageThemeKey(deck.style)] ?? []);
const loadTheme: DeckThemeLoader = async (id) => {
  // The theme registry and the palette engine load with the first theme, off the deck entry.
  const { loadDeckTheme } = await import('@protoyard/decks/style');
  const fontPair = deck.style?.fontPair;
  const loaded = await loadDeckTheme(themeKeyOf(id, fontPair), fontPair);
  warningsByKey = { ...warningsByKey, [id]: loaded.warnings };
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
/**
 * The browser's own print (Ctrl/Cmd+P): the one-slide-per-page sheet replaces
 * the stage on paper (see the print CSS below), and the deck root is released
 * from its one-screen height so every page prints, but only once the sheet
 * is ready (`data-print-ready`): until then the paper shows the stage as on
 * screen, never a blank page. The print view's code is preloaded while the
 * browser is idle (`preloadDeckPrintView`), so the sheet mounted on
 * `beforeprint` renders its pages at once; it still settles themes, images
 * and fonts asynchronously after the browser has captured the page, so the
 * first Ctrl/Cmd+P prints the current slide and says so. The sheet then stays
 * mounted, laid out off-screen and hidden, so every later print has all the
 * slides. It is mounted on the first print only: mounting every slide (and
 * its embedded apps) a second time on load would cost every reader.
 *
 * The deck root is a print isolation target (`data-tx-print-isolate`) as well
 * as the sheet: while the sheet is mounted, Texuli's isolation hides
 * everything outside its targets, and the stage must stay printable until the
 * sheet is ready. Outside the deck root (a host page, a shell frame) nothing
 * prints.
 */
let printSheet = $state(false);
/** The print that just ran had only the stage: the sheet was not ready yet. */
let printedStage = false;
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

/**
 * The print view module with everything it imports on first use (its body and slide
 * painter, G81), so a view mounted after it renders its pages on the first render.
 * DeckApp paints with its own renderer tables only, as the stage does.
 */
async function loadPrintView(): Promise<typeof import('@texuli/slides/export')> {
  const module = await import('@texuli/slides/export');
  await module.preloadDeckPrintView({ defaultRenderers: false });
  return module;
}

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
  let warming = false;
  const warm = () => {
    if (warming) return;
    warming = true;
    void loadPrintView().then(
      (module) => {
        exporter = module;
      },
      () => {
        warming = false;
      }
    );
  };
  const hasIdle = 'requestIdleCallback' in window;
  const idle = hasIdle
    ? window.requestIdleCallback(warm, { timeout: 4_000 })
    : window.setTimeout(warm, 1_500);
  const beforePrint = () => {
    printSheet = true;
    warm();
    // The pages must be in the document before the browser captures it.
    flushSync();
    printedStage = !rootEl?.querySelector(
      ':scope > .deck-app__print-sheet [data-print-ready="true"]'
    );
  };
  const afterPrint = () => {
    if (printedStage) {
      notify(
        'Printed the current slide while the print view got ready. Print again for every slide.'
      );
    }
    printedStage = false;
  };
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  // Capture: the debug panel answers before the stage's own key handling. Always registered:
  // `debug` can turn on after mount, and the handler ignores keys while it is unavailable.
  window.addEventListener('keydown', onKeyDown, true);
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
  {#await loadPrintView()}
    <p class="deck-app__print-status" role="status" data-py-deck-print-loading>Preparing the slides for printing…</p>
  {:then exporter}
    <div class="deck-app__print" data-py-deck-print data-tx-mode={mode}>
      <exporter.DeckPrintView
        deck={printDeck as never}
        notes={printNotes}
        {renderers}
        defaultRenderers={false}
        tier="developer"
        {loadTheme}
        {resolveAvatar}
      />
    </div>
  {:catch}
    <div class="deck-app__print-status" role="alert" data-py-deck-print-error>
      <p>The print view could not be loaded. Check the connection, then try again.</p>
      <Button variant="outline" class="justify-self-center" onclick={() => window.location.reload()}>Reload</Button>
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
    data-tx-print-isolate="true"
    data-py-deck-motion={deck.style?.motion ?? 'default'}
    data-py-deck-theme={deckThemeKey(deck.style)}
    data-py-deck-mode={mode}
    data-tx-mode={mode}
  >
    <DeckStageCore
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
      tools={debugAvailable ? debugTool : undefined}
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
      <!-- Paper only: every visible slide, one per page. On screen it is laid out off-screen and
           hidden, so it settles (images, fonts, lazy families) before the next print. -->
      <div class="deck-app__print-sheet" data-py-deck-print data-tx-mode={mode}>
        <exporter.DeckPrintView
          deck={printDeck as never}
          {renderers}
          defaultRenderers={false}
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

{#snippet debugTool()}
  <!-- With the debug panel available, the stage toolbar gains its button as a host tool (G82). -->
  <IconButton
    variant="ghost"
    class="deck-app__debug"
    label="Debug for agents"
    aria-pressed={debugOpen}
    aria-keyshortcuts="D"
    title="Debug for agents (D)"
    data-py-deck-tool="debug"
    onclick={toggleDebug}
  >
    <LucideIcon icon={Bug} size="sm" />
  </IconButton>
{/snippet}

<style>
  .deck-app :global(.tx-deck-stage) {
    flex: 1;
    min-block-size: 0;
  }

  /*
   * The debug button is a Texuli IconButton (its own size, hover and focus ring) in the
   * stage toolbar; the pressed state shows while the panel is open. Global: the class
   * lands on the IconButton's element, outside this component's scope.
   */
  .deck-app :global(.deck-app__debug[aria-pressed='true']) {
    background: var(--tx-muted);
  }

  .deck-app__print {
    min-block-size: 100%;
  }

  .deck-app__print-status {
    display: grid;
    gap: 0.75rem;
    place-content: center;
    min-block-size: 100dvh;
    padding: 1.5rem;
    color: var(--tx-foreground);
    text-align: center;
  }

  /* Laid out (not `display: none`), so the print view can measure and settle; never seen or focused. */
  @media screen {
    .deck-app__print-sheet {
      position: fixed;
      inset-block-start: 0;
      inset-inline-start: -200vw;
      inline-size: 100vw;
      visibility: hidden;
      pointer-events: none;
    }
  }

  /*
   * Ctrl/Cmd+P with the sheet ready: the sheet alone goes on paper, and the
   * deck root (and a viewport preset's or frame's locked app column) is
   * released from its one-screen height, so every page prints. A sheet that is
   * not ready yet stays off the paper and the stage prints instead. Global
   * selectors: Svelte's scoping would drop rules about the sheet's content.
   */
  @media print {
    :global(.deck-app__print-sheet:not(:has([data-print-ready='true']))) {
      display: none !important;
    }

    :global(.deck-app:has(> .deck-app__print-sheet [data-print-ready='true'])) {
      display: block !important;
      block-size: auto !important;
      max-block-size: none !important;
      overflow: visible !important;
    }

    :global(.deck-app:has(> .deck-app__print-sheet [data-print-ready='true']) > :not(.deck-app__print-sheet)) {
      display: none !important;
    }

    :global(html:has(.deck-app > .deck-app__print-sheet [data-print-ready='true'])),
    :global(html:has(.deck-app > .deck-app__print-sheet [data-print-ready='true']) body),
    :global(html:has(.deck-app > .deck-app__print-sheet [data-print-ready='true']) #app),
    :global(html:has(.deck-app > .deck-app__print-sheet [data-print-ready='true']) [data-py-scroll-root]) {
      block-size: auto !important;
      max-block-size: none !important;
      overflow: visible !important;
      transform: none !important;
    }
  }
</style>
