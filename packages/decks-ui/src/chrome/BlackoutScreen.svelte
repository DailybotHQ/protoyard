<script lang="ts">
import { onMount } from 'svelte';

/**
 * Blackout (B or .): a black screen over everything, chrome included. The
 * whole screen is one real button, so a click or tap brings the deck back as
 * reliably as B or Escape.
 */
let { onclose }: { onclose: () => void } = $props();

let screen = $state<HTMLButtonElement | undefined>();
onMount(() => {
  screen?.focus({ preventScroll: true });
});
</script>

<button
  bind:this={screen}
  type="button"
  class="absolute inset-0 z-50 block size-full cursor-default bg-black outline-none"
  aria-label="Screen blacked out. Press B or select to show the slide."
  data-py-deck-blackout
  data-py-deck-chrome
  onclick={(event) => {
    event.stopPropagation();
    onclose();
  }}
></button>
