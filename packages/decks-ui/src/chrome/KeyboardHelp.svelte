<script lang="ts">
import { DECK_KEY_BINDINGS } from '@protoyard/decks';
import { onMount, tick } from 'svelte';

/**
 * The keyboard shortcuts dialog, generated from the input guard's own binding
 * table so it can never drift from what the keys do. Focus moves to Close on
 * open and back to the opener on close; Escape and ? close it through the
 * deck's key handling.
 */
let { id, onclose }: { id?: string; onclose: () => void } = $props();

let closeButton = $state<HTMLButtonElement | undefined>();
let opener: HTMLElement | null = null;

onMount(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void tick().then(() => closeButton?.focus({ preventScroll: true }));
  return () => {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
});
</script>

<div
  {id}
  class="absolute inset-0 z-30 grid place-items-center bg-background/90 p-6 backdrop-blur"
  role="dialog"
  aria-modal="true"
  aria-labelledby={`${id ?? 'deck-help'}-title`}
  data-py-deck-help
  data-py-deck-chrome
>
  <div class="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg">
    <div class="mb-3 flex items-center justify-between gap-4">
      <h2 id={`${id ?? 'deck-help'}-title`} class="text-lg font-semibold">Keyboard shortcuts</h2>
      <button
        bind:this={closeButton}
        type="button"
        class="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onclick={onclose}
      >
        Close
      </button>
    </div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {#each DECK_KEY_BINDINGS as binding (binding.label)}
        <dt class="flex flex-wrap gap-1">
          {#each binding.keys as key (key)}
            <kbd class="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{key}</kbd>
          {/each}
        </dt>
        <dd class="text-muted-foreground">{binding.label}</dd>
      {/each}
    </dl>
  </div>
</div>
