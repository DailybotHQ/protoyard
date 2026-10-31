<script lang="ts">
import type { LoadProgress, PrototypeRuntime } from '@protoyard/core';
import { Progress } from 'texuli/feedback';
import { usePending } from '../bindings.svelte.ts';
import { chromeMessages } from '../messages.ts';
import { describeLoadProgress } from '../progress.ts';

/**
 * The global "something is processing" signal, rendered for every prototype.
 * A slim bar at the top of the app screen (inside any shell frame) appears
 * once runtime work (`runtime.pending`, or a scenario load) has run longer
 * than `delayMs`, so instant operations never flicker. Work that takes longer
 * than `announceAfterMs` is announced once through a polite live region.
 * The bar is fixed and pointer-transparent: it never shifts layout. It is
 * Texuli's `Progress` (indeterminate while there is no fraction), so its
 * motion and its reduced-motion still state are Texuli's.
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
  <Progress
    class="py-pending-bar"
    data-py-pending-bar
    size="sm"
    value={fraction === null ? null : Math.round(fraction * 100)}
    ariaLabel={message}
  />
{/if}
<p class="sr-only" aria-live="polite" aria-atomic="true" data-py-pending-status>{announce ? message : ''}</p>

<style>
  /* A slim strip across the top of the app screen: under a device's status bar when framed. */
  :global(.py-pending-bar) {
    position: fixed;
    inset-inline: 0;
    top: var(--tx-safe-top, 0px);
    z-index: 70;
    pointer-events: none;
    --tx-progress-track-height-sm: 3px;
    --tx-progress-radius: 0;
  }
  :global(.py-pending-bar [data-tx-progress-track]) {
    background: color-mix(in oklab, var(--tx-primary, currentColor) 18%, transparent);
  }
</style>
