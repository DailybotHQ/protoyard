<script lang="ts">
import type { LoadProgress, PrototypeRuntime } from '@protoyard/core';
import { usePending } from '../bindings.svelte.ts';
import { chromeMessages } from '../messages.ts';
import { describeLoadProgress } from '../progress.ts';

/**
 * The global "something is processing" signal, rendered for every prototype.
 * A slim bar at the top of the app screen (inside any shell frame) appears
 * once runtime work (`runtime.pending`, or a scenario load) has run longer
 * than `delayMs`, so instant operations never flicker. Work that takes longer
 * than `announceAfterMs` is announced once through a polite live region.
 * The bar is fixed and pointer-transparent: it never shifts layout.
 */
let {
  runtime,
  delayMs = 150,
  announceAfterMs = 1000,
}: { runtime: PrototypeRuntime; delayMs?: number; announceAfterMs?: number } = $props();

// svelte-ignore state_referenced_locally
const pending = usePending(runtime);
// svelte-ignore state_referenced_locally
let progress = $state.raw<LoadProgress | null>(runtime.scenarios.progress?.() ?? null);
$effect(() => runtime.scenarios.subscribeProgress?.((next) => (progress = next)));

const busy = $derived(pending.active || progress !== null);
let shown = $state(false);
let announce = $state(false);

$effect(() => {
  if (!busy) {
    shown = false;
    announce = false;
    return;
  }
  const show = setTimeout(() => (shown = true), delayMs);
  const say = setTimeout(() => (announce = true), announceAfterMs);
  return () => {
    clearTimeout(show);
    clearTimeout(say);
  };
});

const load = $derived(progress ? describeLoadProgress(progress) : null);
const fraction = $derived(load?.fraction ?? null);
const message = $derived.by(() => {
  if (load) return load.label;
  const first = pending.operations[0];
  // Service operations carry code names (`deals.update`): say something human instead.
  return first && first.kind !== 'service' ? first.label : chromeMessages().pending.working;
});
</script>

{#if shown}
  <div
    class="py-pending-bar"
    data-py-pending-bar
    role="progressbar"
    aria-label={message}
    aria-valuemin={fraction === null ? undefined : 0}
    aria-valuemax={fraction === null ? undefined : 100}
    aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
  >
    {#if fraction === null}
      <div class="py-pending-bar__indeterminate"></div>
    {:else}
      <div class="py-pending-bar__value" style:width={`${Math.round(fraction * 100)}%`}></div>
    {/if}
  </div>
{/if}
<p class="sr-only" aria-live="polite" aria-atomic="true" data-py-pending-status>{announce ? message : ''}</p>

<style>
  .py-pending-bar {
    position: fixed;
    inset-inline: 0;
    /* The top of the app screen: under a device's status bar when framed. */
    top: var(--tx-safe-top, 0px);
    z-index: 70;
    height: 3px;
    overflow: hidden;
    pointer-events: none;
    background: color-mix(in oklab, var(--color-primary, currentColor) 18%, transparent);
  }
  .py-pending-bar__value {
    height: 100%;
    background: var(--color-primary, currentColor);
    transition: width 200ms ease-out;
  }
  .py-pending-bar__indeterminate {
    height: 100%;
    width: 40%;
    background: var(--color-primary, currentColor);
    animation: py-pending-slide 1.1s ease-in-out infinite;
  }
  @keyframes py-pending-slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }
  /* Reduced motion (OS setting or the prototype toggle): a still, full-width bar. */
  @media (prefers-reduced-motion: reduce) {
    .py-pending-bar__indeterminate {
      width: 100%;
      animation: none;
      opacity: 0.7;
    }
    .py-pending-bar__value {
      transition: none;
    }
  }
  :global([data-py-motion='reduce']) .py-pending-bar__indeterminate {
    width: 100%;
    animation: none;
    opacity: 0.7;
  }
  :global([data-py-motion='reduce']) .py-pending-bar__value {
    transition: none;
  }
</style>
