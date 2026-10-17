<script lang="ts">
import type { LoadProgress, PrototypeRuntime } from '@protoyard/core';
import { describeLoadProgress } from '../progress.ts';

/** Thin top bar while ANY caller (DevTools, link prompt, app code) loads a scenario. */
let { runtime }: { runtime: PrototypeRuntime } = $props();

// svelte-ignore state_referenced_locally
let progress = $state.raw<LoadProgress | null>(runtime.scenarios.progress?.() ?? null);
$effect(() => runtime.scenarios.subscribeProgress?.((next) => (progress = next)));
const view = $derived(progress ? describeLoadProgress(progress) : null);
</script>

{#if view}
  <div class="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-primary/15" aria-hidden="true">
    {#if view.fraction === null}
      <div class="h-full w-1/3 animate-pulse bg-primary"></div>
    {:else}
      <div class="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style:width={`${Math.round(view.fraction * 100)}%`}></div>
    {/if}
  </div>
  <p class="sr-only" role="status">{view.label}</p>
{/if}
