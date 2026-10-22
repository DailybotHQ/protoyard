<script lang="ts">
/**
 * Host-side presenter controller: popup or in-page split, synced over
 * BroadcastChannel when available.
 */
import {
  createBroadcastPresenterTransport,
  createPresenterLink,
  type PresenterLink,
  type PresenterPosition,
  slideStepCount,
} from '@protoyard/decks';
import type { Deck } from '@protoyard/decks/schema';
import type { Snippet } from 'svelte';
import { onDestroy } from 'svelte';
import { openPresenter } from './open.ts';
import PresenterView from './PresenterView.svelte';

let {
  deck,
  namespace = 'deck',
  slideId,
  step = 0,
  open = $bindable(false),
  onPosition,
  onNavigate,
  children,
}: {
  deck: Deck;
  namespace?: string;
  slideId: string;
  step?: number;
  open?: boolean;
  onPosition?: (position: PresenterPosition) => void;
  onNavigate?: (action: 'next' | 'prev' | 'first' | 'last') => void;
  /** Main deck surface shown beside the split presenter panel. */
  children?: Snippet;
} = $props();

let mode = $state<'closed' | 'popup' | 'split'>('closed');
let link = $state.raw<PresenterLink | null>(null);
let popupRef = $state.raw<Window | null>(null);

const activeSlide = $derived(deck.slides.find((s) => s.id === slideId));
const stepCount = $derived(activeSlide ? slideStepCount(activeSlide) : 1);

function teardown(): void {
  link?.destroy();
  link = null;
  if (popupRef && !popupRef.closed) {
    try {
      popupRef.close();
    } catch {
      // ignore
    }
  }
  popupRef = null;
  mode = 'closed';
}

function start(): void {
  teardown();
  const position = { slideId, step };
  const result = openPresenter({
    namespace,
    position,
    onRemote: (pos) => onPosition?.(pos),
  });
  if (result.mode === 'fallback') {
    const transport = createBroadcastPresenterTransport(namespace);
    if (transport) {
      link = createPresenterLink({
        transport,
        initial: position,
        onRemote: (pos) => onPosition?.(pos),
      });
      link.publish(position, 'hello');
    }
    mode = 'split';
    open = true;
    return;
  }
  link = result.link;
  popupRef = result.window;
  mode = 'popup';
  open = true;
  try {
    const doc = result.window.document;
    if (doc?.location?.href === 'about:blank') {
      doc.open();
      doc.write(
        '<!doctype html><title>Presenter</title><body style="margin:0;font-family:system-ui;background:#0a0a0a;color:#fafafa;padding:1rem"><p data-py-presenter-popup>Presenter window — keep the deck tab open for sync.</p><p id="pos"></p></body>'
      );
      doc.close();
    }
  } catch {
    // ignore
  }
}

function stop(): void {
  teardown();
  open = false;
}

// Keep bindable `open` in sync with external toggles.
$effect(() => {
  if (open && mode === 'closed') start();
  if (!open && mode !== 'closed') stop();
});

// Publish local navigation to peers.
$effect(() => {
  if (!link || mode === 'closed') return;
  link.publish({ slideId, step }, 'sync');
  if (popupRef && !popupRef.closed) {
    try {
      const el = popupRef.document.getElementById('pos');
      if (el) el.textContent = `${slideId} · step ${step}`;
    } catch {
      // ignore
    }
  }
});

onDestroy(() => teardown());
</script>

{#if mode === 'split'}
  <div
    class="deck-presenter-split absolute inset-0 z-40 grid bg-background lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]"
    data-py-deck-presenter-split
    role="dialog"
    aria-label="Presenter view"
  >
    <div class="min-h-0 overflow-hidden border-r border-border" data-py-deck-presenter-main>
      {#if children}{@render children()}{/if}
    </div>
    <aside class="min-h-0 overflow-auto">
      <PresenterView {deck} {slideId} {step} {stepCount} {onNavigate} />
      <div class="border-t border-border p-3">
        <button
          type="button"
          class="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          data-py-presenter-close
          onclick={stop}
        >
          Close presenter
        </button>
      </div>
    </aside>
  </div>
{:else if children}
  {@render children()}
{/if}
