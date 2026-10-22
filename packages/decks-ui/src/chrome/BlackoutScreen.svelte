<script lang="ts" module>
/** How long the blackout says how to come back before the screen goes fully black. */
export const BLACKOUT_HINT_MS = 2000;
</script>

<script lang="ts">
import { onMount } from 'svelte';

/**
 * Blackout (B or .): a black screen over everything, chrome included. The
 * whole screen is one real button, so a click or tap brings the deck back as
 * reliably as B or Escape. For two seconds it says so in visible text, then
 * fades to fully black for the room.
 */
let { onclose }: { onclose: () => void } = $props();

let screen = $state<HTMLButtonElement | undefined>();
let hint = $state(true);
onMount(() => {
  screen?.focus({ preventScroll: true });
  const timer = setTimeout(() => (hint = false), BLACKOUT_HINT_MS);
  return () => clearTimeout(timer);
});
</script>

<button
  bind:this={screen}
  type="button"
  class="absolute inset-0 z-50 grid size-full cursor-default place-items-center bg-black outline-none"
  aria-label="Screen blacked out. Press B or select to show the slide."
  data-py-deck-blackout
  data-py-deck-chrome
  onclick={(event) => {
    event.stopPropagation();
    onclose();
  }}
>
  <span
    class={`rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity duration-200 ${hint ? '' : 'opacity-0'}`}
    aria-hidden="true"
    data-py-deck-blackout-hint
    data-visible={hint ? 'true' : 'false'}
  >
    Screen blacked out — press B or click to return
  </span>
</button>
