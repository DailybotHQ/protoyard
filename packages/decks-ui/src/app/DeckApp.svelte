<script lang="ts">
import {
  createDeckNavigator,
  type DeckInputState,
  type DeckLocation,
  type DeckNavigator,
  decideDeckInput,
  inputPathFrom,
  slideStepCount,
} from '@protoyard/decks';
import type { Deck, DeckSlide } from '@protoyard/decks/schema';
import { onMount } from 'svelte';
import DeckCanvas from '../canvas/DeckCanvas.svelte';
import { DeckLayoutRenderer } from '../layouts/index.ts';
import { DeckPrint, PrintButton, parseDeckPrintFlags } from '../print/index.ts';

/**
 * The one deck component both the player deck entry and generated deck
 * prototypes mount (ADR-038). Composes canvas, layout renderers, navigation
 * (with `#/<id>/<step>` hash), guarded input, step progress chrome and
 * aria-live announcements. Print mode (`?print=1`, print button, Ctrl/Cmd+P)
 * swaps in the one-slide-per-page layout from `@protoyard/decks-ui/print`.
 */
let {
  deck,
  class: className = '',
  syncHash = true,
  autofocus = true,
}: {
  /** Validated deck document. */
  deck: Deck;
  class?: string;
  /** When true (default), keep `location.hash` in sync with the navigator. */
  syncHash?: boolean;
  /** Focus the deck root on mount so keyboard navigation works immediately. */
  autofocus?: boolean;
} = $props();

let rootEl = $state<HTMLDivElement | undefined>();
let location = $state<DeckLocation | null>(null);
let announce = $state('');
let inputState = $state<DeckInputState>({
  overview: 'closed',
  blackout: false,
  laser: false,
  help: false,
});
/** Stable navigator for the current deck; rebuilt only when the deck changes. */
let nav = $state.raw<DeckNavigator | null>(null);

/** URL print mode (`?print=1`) or temporary layout while the browser prints. */
let printFlags = $state(parseDeckPrintFlags());
let printing = $state(false);
const showPrint = $derived(printFlags.print || printing);

// Pointer tracking for swipe decisions.
let pointerDown: { x: number; y: number; t: number; id: number } | null = null;

// Rebuild the navigator when the deck document changes.
$effect(() => {
  const next = createDeckNavigator(deck, { stepCount: slideStepCount });
  nav = next;
  let loc = next.getLocation();
  if (syncHash && typeof window !== 'undefined') {
    const fromHash = next.applyHash(window.location.hash);
    if (fromHash) loc = fromHash;
    else writeHash(next);
  }
  location = loc;
  announceSlide(loc, deck.slides.length, next.visibleSlides());
});

const activeIndex = $derived(location?.slideIndex ?? 0);
const activeStep = $derived(location?.step ?? 0);
const activeStepCount = $derived(location?.stepCount ?? 1);
const visible = $derived(location && nav ? nav.visibleSlides() : []);
const visibleOrdinal = $derived.by(() => {
  const id = location?.slideId;
  if (!id) return 0;
  const at = visible.findIndex((slide) => slide.id === id);
  return at >= 0 ? at : 0;
});
const progress = $derived(visible.length === 0 ? 0 : ((visibleOrdinal + 1) / visible.length) * 100);
const slideLabel = $derived(
  visible.length === 0 ? 'No slides' : `Slide ${visibleOrdinal + 1} of ${visible.length}`
);

function writeHash(target: DeckNavigator): void {
  if (!syncHash || typeof window === 'undefined' || typeof history === 'undefined') return;
  const next = target.toHash();
  if (window.location.hash === next) return;
  history.replaceState(null, '', next);
}

function announceSlide(
  loc: DeckLocation,
  total: number,
  visibleSlides: readonly DeckSlide[] = nav?.visibleSlides() ?? []
): void {
  const at = visibleSlides.findIndex((slide) => slide.id === loc.slideId);
  const ordinal = at >= 0 ? at + 1 : loc.slideIndex + 1;
  const n = visibleSlides.length > 0 ? visibleSlides.length : total;
  announce = `Slide ${ordinal} of ${n}`;
}

function applyLocation(next: DeckLocation): void {
  location = next;
  if (nav) writeHash(nav);
  announceSlide(next, deck.slides.length);
  // Move focus to the deck root so the live region and keyboard stay coupled.
  if (typeof document !== 'undefined' && rootEl && document.activeElement !== rootEl) {
    // Only steal focus when the user is interacting with the deck itself.
    if (rootEl.contains(document.activeElement) || document.activeElement === document.body) {
      rootEl.focus({ preventScroll: true });
    }
  }
}

function runAction(action: string): void {
  const current = nav;
  if (!current) return;
  switch (action) {
    case 'next':
      applyLocation(current.next());
      break;
    case 'prev':
      applyLocation(current.prev());
      break;
    case 'first':
      applyLocation(current.first());
      break;
    case 'last':
      applyLocation(current.last());
      break;
    case 'overview':
      inputState = {
        ...inputState,
        overview: inputState.overview === 'open' ? 'closed' : 'open',
        help: false,
      };
      break;
    case 'blackout':
      inputState = { ...inputState, blackout: !inputState.blackout, help: false };
      break;
    case 'help':
      inputState = { ...inputState, help: !inputState.help };
      break;
    case 'laser':
      inputState = { ...inputState, laser: !inputState.laser };
      break;
    case 'fullscreen':
      if (typeof document === 'undefined') break;
      if (!document.fullscreenElement) {
        void rootEl?.requestFullscreen?.();
      } else {
        void document.exitFullscreen?.();
      }
      break;
    case 'presenter':
      // Presenter window is a dedicated surface (T-decks-presenter).
      break;
    case 'print':
      // Enter print layout then open the browser dialog (also Ctrl/Cmd+P).
      printing = true;
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        queueMicrotask(() => window.print());
      }
      break;
    default:
      break;
  }
}

function eventPath(event: Event): ReturnType<typeof inputPathFrom> {
  const path =
    typeof event.composedPath === 'function'
      ? event.composedPath()
      : event.target
        ? [event.target]
        : [];
  return inputPathFrom(path, rootEl);
}

function onKeyDown(event: KeyboardEvent): void {
  const action = decideDeckInput(
    {
      kind: 'key',
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      repeat: event.repeat,
      isComposing: event.isComposing,
      path: eventPath(event),
    },
    inputState
  );
  if (!action) return;
  event.preventDefault();
  runAction(action);
}

function onClick(event: MouseEvent): void {
  const action = decideDeckInput(
    {
      kind: 'click',
      button: event.button,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      selectionLength:
        typeof window !== 'undefined' ? (window.getSelection()?.toString().length ?? 0) : 0,
      path: eventPath(event),
    },
    inputState
  );
  if (!action) return;
  event.preventDefault();
  runAction(action);
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointerDown = { x: event.clientX, y: event.clientY, t: event.timeStamp, id: event.pointerId };
}

function onPointerUp(event: PointerEvent): void {
  const start = pointerDown;
  pointerDown = null;
  if (!start || start.id !== event.pointerId) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  const durationMs = event.timeStamp - start.t;
  const action = decideDeckInput(
    {
      kind: 'swipe',
      dx,
      dy,
      durationMs,
      pointerType:
        event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse',
      path: eventPath(event),
    },
    inputState
  );
  if (!action) return;
  event.preventDefault();
  runAction(action);
}

function onHashChange(): void {
  if (!syncHash || !nav) return;
  const next = nav.applyHash(window.location.hash);
  if (next) {
    location = next;
    announceSlide(next, deck.slides.length);
  }
}

function layoutPropsFor(slide: DeckSlide): { layout: string; props: unknown } {
  if (slide.layout === 'free') {
    return { layout: 'free', props: { blocks: 'blocks' in slide ? slide.blocks : [] } };
  }
  return {
    layout: slide.layout,
    props: 'props' in slide ? slide.props : {},
  };
}

function goOverview(slideId: string): void {
  if (!nav) return;
  // Close first so a bubbling click cannot double-advance while open/closing.
  inputState = { ...inputState, overview: 'closed' };
  applyLocation(nav.goTo(slideId, 0));
}

function closeOverview(): void {
  inputState = { ...inputState, overview: 'closed' };
}

onMount(() => {
  if (autofocus && !showPrint) rootEl?.focus({ preventScroll: true });
  if (typeof window === 'undefined') return undefined;
  const onBeforePrint = () => {
    printing = true;
  };
  const onAfterPrint = () => {
    // Stay in print layout when the URL asked for it.
    if (!parseDeckPrintFlags().print) printing = false;
  };
  const onPopState = () => {
    printFlags = parseDeckPrintFlags();
  };
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  window.addEventListener('popstate', onPopState);
  if (syncHash) window.addEventListener('hashchange', onHashChange);
  return () => {
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
    window.removeEventListener('popstate', onPopState);
    if (syncHash) window.removeEventListener('hashchange', onHashChange);
  };
});
</script>

{#if showPrint}
  <DeckPrint deck={deck} notes={printFlags.notes} />
{:else}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={rootEl}
  class={`deck-app relative flex size-full min-h-0 flex-col bg-background text-foreground outline-none ${className}`}
  data-py-deck-app
  data-slide-id={location?.slideId ?? ''}
  data-slide-step={activeStep}
  data-blackout={inputState.blackout ? 'true' : undefined}
  role="application"
  aria-label={deck.outline?.title ?? 'Presentation'}
  tabindex="0"
  onkeydown={onKeyDown}
  onclick={onClick}
  onpointerdown={onPointerDown}
  onpointerup={onPointerUp}
  onpointercancel={() => {
    pointerDown = null;
  }}
>
  <div class="min-h-0 flex-1">
    <DeckCanvas
      slides={deck.slides}
      activeIndex={activeIndex}
      aspect={deck.style?.aspect ?? '16:9'}
      label={deck.outline?.title ?? 'Presentation'}
    >
      {#snippet children(slide: DeckSlide, _index: number)}
        {@const layout = layoutPropsFor(slide)}
        <div
          class="deck-app__slide size-full"
          data-py-deck-slide={slide.id}
          data-step={location?.slideId === slide.id ? activeStep : 0}
          data-step-count={location?.slideId === slide.id ? activeStepCount : 1}
          style={location?.slideId === slide.id
            ? `--py-deck-step:${activeStep};--py-deck-step-count:${activeStepCount}`
            : undefined}
        >
          <DeckLayoutRenderer layout={layout.layout as never} props={layout.props} />
        </div>
      {/snippet}
    </DeckCanvas>
  </div>

  <!-- Chrome: progress + slide number (guarded from advancing the deck). -->
  <div
    class="deck-app__chrome pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3"
    data-py-deck-chrome
    data-py-deck-chrome-root
  >
    <div
      class="pointer-events-auto h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      aria-label="Deck progress"
      data-py-deck-progress
    >
      <div
        class="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
        style={`width:${progress}%`}
      ></div>
    </div>
    <p
      class="pointer-events-auto shrink-0 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
      data-py-deck-slide-number
    >
      {slideLabel}
    </p>
    <div class="pointer-events-auto shrink-0" data-py-deck-chrome>
      <PrintButton />
    </div>
  </div>

  {#if inputState.blackout}
    <div
      class="absolute inset-0 z-20 bg-black"
      data-py-deck-blackout
      aria-hidden="true"
    ></div>
  {/if}

  {#if inputState.overview === 'open'}
    {#await import('../overview/index.ts')}
      <div
        class="absolute inset-0 z-30 grid place-items-center bg-background/95 backdrop-blur"
        data-py-deck-overview
        data-py-deck-overview-loading
        role="status"
        aria-label="Loading slide overview"
      >
        <span class="text-sm text-muted-foreground">Loading overview…</span>
      </div>
    {:then mod}
      {@const Overview = mod.DeckOverview}
      <Overview
        slides={visible}
        activeSlideId={location?.slideId ?? ''}
        aspect={deck.style?.aspect ?? '16:9'}
        onSelect={goOverview}
        onClose={closeOverview}
      />
    {:catch}
      <div
        class="absolute inset-0 z-30 grid place-items-center bg-background/95 p-6 backdrop-blur"
        data-py-deck-overview
        role="alert"
      >
        <p class="text-sm text-destructive">The overview could not be loaded.</p>
      </div>
    {/await}
  {/if}

  {#if inputState.help}
    <div
      class="absolute inset-0 z-30 grid place-items-center bg-background/90 p-6 backdrop-blur"
      data-py-deck-help
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div class="max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 class="mb-3 text-lg font-semibold">Keyboard shortcuts</h2>
        <ul class="space-y-1 text-sm text-muted-foreground">
          <li><kbd>→</kbd> / <kbd>Space</kbd> — next step or slide</li>
          <li><kbd>←</kbd> — previous step or slide</li>
          <li><kbd>Home</kbd> / <kbd>End</kbd> — first / last slide</li>
          <li><kbd>O</kbd> — overview · <kbd>B</kbd> — blackout · <kbd>?</kbd> — help</li>
          <li><kbd>Esc</kbd> — close overlay</li>
        </ul>
      </div>
    </div>
  {/if}

  <div class="sr-only" aria-live="polite" aria-atomic="true" data-py-deck-live>
    {announce}
  </div>
</div>
{/if}

<style>
  .deck-app :global([data-py-deck-slide]) {
    view-transition-name: deck-slide;
  }

  @supports not (view-transition-name: none) {
    .deck-app :global([data-py-deck-slide]) {
      animation: deck-app-fade 180ms ease-out;
    }
  }

  @keyframes deck-app-fade {
    from {
      opacity: 0.72;
    }
    to {
      opacity: 1;
    }
  }
</style>
