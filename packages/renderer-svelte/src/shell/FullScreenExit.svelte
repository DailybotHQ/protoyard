<script lang="ts">
import { onMount } from 'svelte';
import { isFrameExitKey } from './frame-mode.ts';
import Icon from './Icon.svelte';

/**
 * Full screen mode: the app fills the viewport with no chrome. "Show in frame"
 * is the first tab stop and stays invisible until it has keyboard focus (like
 * a skip link), so it never covers the app; Escape works too. A short hint
 * says so when full screen starts, without taking pointer events.
 */
let { onexit }: { onexit: () => void } = $props();

let hint = $state(true);

onMount(() => {
  const timer = setTimeout(() => (hint = false), 4000);
  const onKey = (event: KeyboardEvent) => {
    if (!isFrameExitKey(event)) return;
    event.preventDefault();
    onexit();
  };
  // Leaving real browser full screen (its own Escape) returns to the frame too.
  let wasFullscreen = Boolean(document.fullscreenElement);
  const onFullscreen = () => {
    const now = Boolean(document.fullscreenElement);
    if (wasFullscreen && !now) onexit();
    wasFullscreen = now;
  };
  window.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFullscreen);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreen);
  };
});
</script>

<button
  type="button"
  data-py-frame-toggle
  aria-label="Show in frame"
  aria-pressed="true"
  title="Show in frame (Esc)"
  class="pointer-events-none fixed top-2 right-2 z-[70] flex size-8 items-center justify-center rounded-full border border-white/20 bg-zinc-800/90 text-white opacity-0 shadow-sm focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-zinc-950/90"
  onclick={onexit}
>
  <Icon name="shrink" class="size-4" />
</button>
{#if hint}
  <p
    data-py-frame-hint
    role="status"
    class="pointer-events-none fixed top-3 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-zinc-900/85 px-3 py-1 text-xs text-white shadow-sm"
  >
    Full screen · press Esc to show the frame
  </p>
{/if}
