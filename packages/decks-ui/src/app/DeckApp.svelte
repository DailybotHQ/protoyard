<script lang="ts">
import type { PresenterPosition } from '@protoyard/decks';
import {
  createDeckNavigator,
  type DeckControlEnvironment,
  type DeckInputState,
  type DeckLocation,
  type DeckNavigator,
  decideDeckInput,
  formatDeckHash,
  inputPathFrom,
  slidePositionCount,
  slideStepCount,
} from '@protoyard/decks';
import type { AgentReferenceSource } from '@protoyard/decks/agent';
import { type Deck, type DeckSlide, isCustomSlide } from '@protoyard/decks/schema';
import type { Component } from 'svelte';
import { onMount, tick } from 'svelte';
import DeckCanvas from '../canvas/DeckCanvas.svelte';
import {
  BlackoutScreen,
  ChromeToast,
  createDeckFullscreen,
  type DeckFullscreen,
  type DeckFullscreenMode,
  type DeckToolAction,
  DeckToolbar,
  FirstRunHint,
  FullscreenOverlay,
  KeyboardHelp,
  LaserPointer,
} from '../chrome/index.ts';
import { type DeckDebugSetting, deckDebugAvailable, isDevBuild } from '../debug/availability.ts';
import CustomSlideHost from '../layouts/CustomSlideHost.svelte';
import type { CustomSlideRegistry } from '../layouts/custom-slides.ts';
import { DeckLayoutRenderer } from '../layouts/index.ts';
import SlideStepHost from '../layouts/SlideStepHost.svelte';
import { DeckPrint, parseDeckPrintFlags } from '../print/index.ts';
import { DeckSlideFrame, DeckStyleState, setDeckStyleContext } from '../style/index.ts';

/**
 * The one deck component both the player deck entry and generated deck
 * prototypes mount (ADR-038). Composes canvas, layout renderers, navigation
 * (with `#/<id>/<step>` hash), guarded input, step progress chrome and
 * aria-live announcements. Print mode (`?print=1`, print button, Ctrl/Cmd+P)
 * swaps in the one-slide-per-page layout from `@protoyard/decks-ui/print`.
 * Presenter (S/P) loads `@protoyard/decks-ui/presenter` lazily.
 *
 * `deck.style` (theme, palette seed, fonts, density, radius, motion, deck
 * and per-slide backgrounds, logo, footer, slide numbers) is resolved by a
 * lazy style kit and applied to this root only, never to `<html>`, so the
 * host and DevTools keep their own theme.
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
}: {
  /** Validated deck document. */
  deck: Deck;
  class?: string;
  /** When true (default), keep `location.hash` in sync with the navigator. */
  syncHash?: boolean;
  /** Focus the deck root on mount so keyboard navigation works immediately. */
  autofocus?: boolean;
  /** BroadcastChannel namespace for the presenter (defaults to "deck"). */
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
   * `?debug=1`; `on` always; `off` never. Exports, artifacts and the hosted
   * player are production builds, so it is off there unless asked for.
   */
  debug?: DeckDebugSetting;
  /** Where the deck came from, for the agent reference (a blueprint path, a prototype slug). */
  debugSource?: AgentReferenceSource | null;
  /**
   * A generated deck's own slide components (`src/custom-slides.ts`), for
   * `layout: "custom"` slides. Without it (the player) they show a labelled
   * placeholder.
   */
  customSlides?: CustomSlideRegistry;
} = $props();

const debugAvailable = $derived(
  deckDebugAvailable(debug, {
    dev: isDevBuild(),
    search: typeof window === 'undefined' ? '' : window.location.search,
  })
);
/** The debug panel is open (its chunk loads on first open). */
let debugOpen = $state(false);

const deckStyle = new DeckStyleState();
setDeckStyleContext({
  state: deckStyle,
  get deckBackground() {
    return deck.style?.background;
  },
});
$effect(() => {
  void deckStyle.resolve(deck.style, mode);
});

let rootEl = $state<HTMLDivElement | undefined>();
let chromeEl = $state<HTMLDivElement | undefined>();
let location = $state<DeckLocation | null>(null);
let announce = $state('');
let inputState = $state<DeckInputState>({
  overview: 'closed',
  blackout: false,
  laser: false,
  help: false,
});
/**
 * `native` while the deck root is the browser's full screen element, `window`
 * while it fills the page instead (the API is missing or refused); null
 * otherwise. The chrome row gives way to the full screen overlay.
 */
let fullscreenMode = $state<DeckFullscreenMode | null>(null);
const fullscreen = $derived(fullscreenMode !== null);
/** What the full screen control will do here, for its tooltip. */
let fullscreenPreferred = $state<DeckFullscreenMode>('native');
let fullscreenControl: DeckFullscreen | null = null;
const controlEnvironment = $derived<DeckControlEnvironment>({
  // Always available: fill-the-window mode covers a missing or refused Fullscreen API.
  fullscreen: true,
  popup: typeof window !== 'undefined' && typeof window.open === 'function',
  clipboard: true,
  print: typeof window !== 'undefined' && typeof window.print === 'function',
  debug: debugAvailable,
});
const uid = $props.id();
const helpId = `deck-help-${uid}`;
/** Stable navigator for the current deck; rebuilt only when the deck changes. */
let nav = $state.raw<DeckNavigator | null>(null);

/** URL print mode (`?print=1`) or temporary layout while the browser prints. */
let printFlags = $state(parseDeckPrintFlags());
let printing = $state(false);
const showPrint = $derived(printFlags.print || printing);

/** Presenter host loaded only when S/P opens it (lazy chunk). */
let presenterOpen = $state(false);
type PresenterHostProps = {
  deck: Deck;
  namespace?: string;
  slideId: string;
  step?: number;
  open?: boolean;
  onPosition?: (position: PresenterPosition) => void;
  onNavigate?: (action: 'next' | 'prev' | 'first' | 'last') => void;
  children?: import('svelte').Snippet;
};
let PresenterHostComp = $state.raw<Component<PresenterHostProps> | null>(null);
let presenterLoadError = $state(false);

/** The deck's one feedback toast (copy results). */
let toast = $state<ReturnType<typeof ChromeToast> | undefined>();
/** The last pointer position over the deck (client pixels): the laser starts there. */
let lastPointer = $state.raw<{ x: number; y: number } | null>(null);

// Pointer tracking for swipe decisions.
let pointerDown: { x: number; y: number; t: number; id: number } | null = null;

// Rebuild the navigator when the deck document changes.
$effect(() => {
  // Positions are the initial state plus one per advance (`slidePositionCount`),
  // so the last step of every slide is reachable by keys and by `#/<id>/<step>`.
  const next = createDeckNavigator(deck, { stepCount: slidePositionCount });
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

/** Keep keyboard navigation on the deck root after overlays dismiss. */
function focusDeckRoot(): void {
  if (typeof document === 'undefined' || !rootEl) return;
  const active = document.activeElement;
  if (active === rootEl) return;
  if (active === document.body || active === null || rootEl.contains(active)) {
    rootEl.focus({ preventScroll: true });
  }
}

function applyLocation(next: DeckLocation): void {
  location = next;
  if (nav) writeHash(nav);
  announceSlide(next, deck.slides.length);
  // Move focus to the deck root so the live region and keyboard stay coupled.
  focusDeckRoot();
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
    case 'blackout': {
      const next = !inputState.blackout;
      inputState = { ...inputState, blackout: next, help: false };
      // Leaving blackout returns focus to the deck so B / arrows keep working.
      if (!next) queueMicrotask(() => focusDeckRoot());
      break;
    }
    case 'help':
      inputState = { ...inputState, help: !inputState.help };
      break;
    case 'laser':
      inputState = { ...inputState, laser: !inputState.laser };
      // Laser is pointer-events: none, but a prior blackout button can leave focus adrift.
      queueMicrotask(() => focusDeckRoot());
      break;
    case 'fullscreen':
      void fullscreenControl?.toggle();
      break;
    case 'fullscreen-exit':
      void fullscreenControl?.exit();
      break;
    case 'presenter':
      presenterOpen = !presenterOpen;
      if (presenterOpen) void ensurePresenterHost();
      break;
    case 'debug':
      if (debugAvailable) debugOpen = !debugOpen;
      if (!debugOpen) queueMicrotask(() => focusDeckRoot());
      break;
    case 'print':
      // Enter print layout then open the browser dialog (also Ctrl/Cmd+P).
      // The print layout is in the DOM before the dialog captures the page.
      printing = true;
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        void tick().then(() => window.print());
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

/** The guard's view of the deck: overlays plus whether it is full screen. */
function guardState(): DeckInputState {
  return { ...inputState, fullscreen, debugAvailable, debug: debugOpen };
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
    guardState()
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
    guardState()
  );
  if (!action) return;
  event.preventDefault();
  runAction(action);
}

function onPointerDown(event: PointerEvent): void {
  lastPointer = { x: event.clientX, y: event.clientY };
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
    guardState()
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
    // A clamped link (`#/<id>/99`) is rewritten to the step it shows.
    writeHash(nav);
    announceSlide(next, deck.slides.length);
  }
}

/**
 * The step a mounted slide shows: the active one its current step, a
 * neighbour before it its last step (where going back lands), one after it
 * its initial state.
 */
function stepOf(slide: DeckSlide): number {
  if (location?.slideId === slide.id) return activeStep;
  const at = numberOf(slide.id) ?? 0;
  const here = location ? (numberOf(location.slideId) ?? 0) : 0;
  return at < here ? slideStepCount(slide) : 0;
}

/** 1-based position of a slide among the visible slides (hidden slides have none). */
function numberOf(slideId: string): number | undefined {
  const at = visible.findIndex((slide) => slide.id === slideId);
  return at >= 0 ? at + 1 : undefined;
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

/** A plain link to the current slide and step: this page's URL with its `#/<id>/<step>` hash. */
function currentLink(): string {
  const id = location?.slideId ?? deck.slides[0]?.id ?? '';
  const hash = formatDeckHash(id, location?.step ?? 0);
  if (typeof window === 'undefined') return hash;
  return `${window.location.href.split('#')[0]}${hash}`;
}

function onCopied(ok: boolean): void {
  if (ok) toast?.show(`Link to slide ${visibleOrdinal + 1} copied`);
  else toast?.show('Could not copy the link', 'error');
}

function onTool(action: DeckToolAction): void {
  runAction(action);
}

function jumpToSlide(slideId: string): void {
  if (!nav) return;
  const next = nav.goTo(slideId, 0);
  location = next;
  writeHash(nav);
  announceSlide(next, deck.slides.length);
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

async function ensurePresenterHost(): Promise<void> {
  if (PresenterHostComp) return;
  presenterLoadError = false;
  try {
    const mod = await import('../presenter/index.ts');
    PresenterHostComp = mod.PresenterHost as Component<PresenterHostProps>;
  } catch {
    presenterLoadError = true;
    presenterOpen = false;
  }
}

function onPresenterPosition(position: PresenterPosition): void {
  if (!nav) return;
  applyLocation(nav.goTo(position.slideId, position.step));
}

function onPresenterNavigate(action: 'next' | 'prev' | 'first' | 'last'): void {
  runAction(action);
}

// While the deck owns the viewport, lift the DevTools launcher above the
// chrome row (DevTools reads `--py-devtools-offset` from :root) so it never
// covers the deck's own tools. Removed when the chrome goes away.
$effect(() => {
  const chrome = chromeEl;
  if (fit !== 'viewport' || !chrome || typeof ResizeObserver === 'undefined') return;
  const root = document.documentElement;
  const apply = () =>
    root.style.setProperty('--py-devtools-offset', `${Math.ceil(chrome.offsetHeight)}px`);
  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(chrome);
  return () => {
    observer.disconnect();
    root.style.removeProperty('--py-devtools-offset');
  };
});

onMount(() => {
  if (autofocus && !showPrint) rootEl?.focus({ preventScroll: true });
  if (typeof window === 'undefined') return undefined;
  const fullscreenController = createDeckFullscreen({
    element: () => rootEl,
    onChange: (mode) => {
      fullscreenMode = mode;
      // The pressed button unmounts with the chrome: keep the keyboard on the deck.
      queueMicrotask(() => focusDeckRoot());
    },
  });
  fullscreenControl = fullscreenController;
  fullscreenPreferred = fullscreenController.preferred;
  const onPointerMove = (event: PointerEvent) => {
    lastPointer = { x: event.clientX, y: event.clientY };
  };
  const pointerRoot = rootEl;
  pointerRoot?.addEventListener('pointermove', onPointerMove, { passive: true });
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
    pointerRoot?.removeEventListener('pointermove', onPointerMove);
    fullscreenController.destroy();
    fullscreenControl = null;
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
    window.removeEventListener('popstate', onPopState);
    if (syncHash) window.removeEventListener('hashchange', onHashChange);
  };
});
</script>

{#if showPrint}
  <div
    class="contents"
    style={deckStyle.rootStyle}
    data-py-deck-theme={deckStyle.resolution?.themeId}
    data-py-deck-mode={deckStyle.resolution?.mode}
  >
    <DeckPrint deck={deck} notes={printFlags.notes} />
  </div>
{:else}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={rootEl}
  class={`deck-app flex w-full min-h-0 flex-col overflow-hidden bg-background text-foreground outline-none ${fullscreenMode === 'window' ? 'fixed inset-0 z-[2147483000] h-dvh' : `relative ${fit === 'container' ? 'h-full' : 'h-app'}`} ${className}`}
  data-py-deck-fit={fit}
  data-py-deck-app
  data-slide-id={location?.slideId ?? ''}
  data-slide-step={activeStep}
  data-blackout={inputState.blackout ? 'true' : undefined}
  data-laser={inputState.laser ? 'true' : undefined}
  data-fullscreen={fullscreen ? 'true' : undefined}
  data-fullscreen-mode={fullscreenMode ?? undefined}
  data-presenter={presenterOpen ? 'true' : undefined}
  data-py-deck-theme={deckStyle.resolution?.themeId}
  data-py-deck-mode={deckStyle.resolution?.mode}
  data-py-deck-style={deckStyle.status}
  data-py-deck-motion={deck.style?.motion ?? 'default'}
  style={deckStyle.rootStyle}
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
  {#snippet deckSurface()}
    <!-- A column: the stage takes the space the chrome row leaves, so the chrome never covers a slide. -->
    <div class="relative flex min-h-0 flex-1 flex-col" data-py-deck-surface>
    <div class="relative min-h-0 flex-1" data-py-deck-stage-area>
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
            data-step={stepOf(slide)}
            data-step-count={location?.slideId === slide.id ? activeStepCount : 1}
            style={location?.slideId === slide.id
              ? `--py-deck-step:${activeStep};--py-deck-step-count:${activeStepCount}`
              : undefined}
          >
            <DeckSlideFrame
              background={slide.background}
              mediaPreload={_index === activeIndex || _index === activeIndex + 1 ? 'auto' : 'none'}
              number={numberOf(slide.id)}
            >
              <SlideStepHost {slide} step={stepOf(slide)}>
                {#if isCustomSlide(slide)}
                  <CustomSlideHost
                    {slide}
                    step={stepOf(slide)}
                    stepCount={slideStepCount(slide)}
                    registry={customSlides}
                  />
                {:else}
                  <DeckLayoutRenderer layout={layout.layout as never} props={layout.props} />
                {/if}
              </SlideStepHost>
            </DeckSlideFrame>
          </div>
        {/snippet}
      </DeckCanvas>
    </div>

    {#if !fullscreen && deckStyle.warnings.length > 0}
      <p
        class="shrink-0 border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
        role="status"
        data-py-deck-style-warning
      >
        {deckStyle.warnings.join(' ')}
      </p>
    {/if}

    <!-- Chrome: its own row below the stage (progress, slide number, presenting tools), guarded from advancing the deck. Hidden in full screen, where the stage takes the whole screen. -->
    {#if !fullscreen}
      <div
        bind:this={chromeEl}
        class="deck-app__chrome flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-background px-3 py-2"
        data-py-deck-chrome
        data-py-deck-chrome-root
      >
        <div
          class="pointer-events-auto order-first h-1.5 min-w-0 basis-full overflow-hidden rounded-full bg-muted sm:order-none sm:basis-auto sm:flex-1"
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
        <div class="pointer-events-auto ml-auto flex min-w-0 items-center gap-1 overflow-x-auto" data-py-deck-chrome>
          <DeckToolbar
            blackout={inputState.blackout === true}
            laser={inputState.laser === true}
            help={inputState.help === true}
            overview={inputState.overview === 'open'}
            presenter={presenterOpen}
            {fullscreen}
            debug={debugOpen}
            {fullscreenPreferred}
            {helpId}
            reference={currentLink}
            slides={visible}
            currentOrdinal={visibleOrdinal + 1}
            environment={controlEnvironment}
            onaction={onTool}
            onjump={jumpToSlide}
            oncopied={onCopied}
          />
        </div>
      </div>
    {/if}

    {#if fullscreenMode}
      <FullscreenOverlay
        mode={fullscreenMode}
        counter={`${visibleOrdinal + 1} / ${visible.length}`}
        container={rootEl}
        suppressed={inputState.blackout === true || inputState.laser === true}
        onaction={runAction}
      />
    {/if}

    {#if inputState.laser}
      <LaserPointer container={rootEl} start={lastPointer} />
    {/if}

    {#if inputState.blackout}
      <BlackoutScreen
        onclose={() => {
          runAction('blackout');
          queueMicrotask(() => focusDeckRoot());
        }}
      />
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
      <KeyboardHelp id={helpId} environment={controlEnvironment} onclose={() => runAction('help')} />
    {/if}

    {#if debugOpen && debugAvailable && !presenterOpen}
      {#await import('../debug/DeckDebugPanel.svelte')}
        <div class="absolute inset-y-0 right-0 z-40 grid w-full max-w-md place-items-center border-l border-border bg-background print:hidden" role="status" data-py-deck-debug-loading data-py-deck-chrome>
          <span class="text-sm text-muted-foreground">Loading the debug panel…</span>
        </div>
      {:then mod}
        <mod.default
          {deck}
          slideId={location?.slideId ?? deck.slides[0]?.id ?? ''}
          step={activeStep}
          root={rootEl}
          source={debugSource}
          onjump={jumpToSlide}
          onclose={() => runAction('debug')}
          onnotify={(message, tone) => toast?.show(message, tone)}
        />
      {:catch}
        <div class="absolute inset-y-0 right-0 z-40 grid w-full max-w-md place-items-center border-l border-border bg-background p-6 print:hidden" role="alert" data-py-deck-chrome>
          <p class="text-sm text-destructive">The debug panel could not be loaded.</p>
        </div>
      {/await}
    {/if}

    <ChromeToast bind:this={toast} />

    {#if !presenterOpen}
      <FirstRunHint {namespace} container={rootEl} />
    {/if}

    <div class="sr-only" aria-live="polite" aria-atomic="true" data-py-deck-live>
      {announce}
    </div>
    </div>
  {/snippet}

  {#if presenterOpen && PresenterHostComp}
    {@const Host = PresenterHostComp}
    <Host
      {deck}
      {namespace}
      slideId={location?.slideId ?? deck.slides[0]?.id ?? 'intro'}
      step={activeStep}
      bind:open={presenterOpen}
      onPosition={onPresenterPosition}
      onNavigate={onPresenterNavigate}
    >
      {#snippet children()}
        {@render deckSurface()}
      {/snippet}
    </Host>
  {:else}
    {@render deckSurface()}
    {#if presenterOpen && !PresenterHostComp && !presenterLoadError}
      <div
        class="absolute inset-0 z-40 grid place-items-center bg-background/80 backdrop-blur"
        data-py-deck-presenter-loading
        role="status"
        aria-label="Loading presenter"
      >
        <span class="text-sm text-muted-foreground">Loading presenter…</span>
      </div>
    {/if}
  {/if}
</div>
{/if}

<style>
  .deck-app :global([data-py-deck-slide]) {
    view-transition-name: deck-slide;
  }

  /* The laser dot replaces the cursor while it is on. */
  .deck-app[data-laser='true'] {
    cursor: none;
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
