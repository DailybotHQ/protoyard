<script lang="ts">
import type { Deck } from '@protoyard/decks/schema';
import { onMount } from 'svelte';
import { openPresenter } from '../../src/presenter/open.ts';
import PresenterView from '../../src/presenter/PresenterView.svelte';

/**
 * Test harness that forces the in-page split path (popup blocked) without
 * needing BroadcastChannel or a real window.open.
 */
let {
  deck,
  slideId = 'intro',
  step = 0,
  open = true,
  forceFallback = true,
}: {
  deck: Deck;
  slideId?: string;
  step?: number;
  open?: boolean;
  forceFallback?: boolean;
} = $props();

let split = $state(false);

onMount(() => {
  if (!open) return;
  if (forceFallback) {
    const result = openPresenter({
      namespace: 'harness',
      position: { slideId, step },
      onRemote: () => {},
      openWindow: () => null,
      broadcast: class {
        name: string;
        constructor(name: string) {
          this.name = name;
        }
        postMessage() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
      } as unknown as new (
        name: string
      ) => BroadcastChannel,
    });
    split = result.mode === 'fallback';
  }
});
</script>

{#if split}
  <div data-py-deck-presenter-split role="dialog" aria-label="Presenter view">
    <div data-py-deck-presenter-main>
      <p>Main deck surface</p>
    </div>
    <aside>
      <PresenterView {deck} {slideId} {step} stepCount={2} />
      <button type="button" data-py-presenter-close onclick={() => (split = false)}>
        Close presenter
      </button>
    </aside>
  </div>
{/if}
