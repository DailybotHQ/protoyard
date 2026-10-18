<script lang="ts">
import { rotate } from '@protoyard/core';
import { getRuntime } from '../../context.ts';
import HomeIndicator from './HomeIndicator.svelte';
import type { FrameProps } from './registry.ts';
import StatusBar from './StatusBar.svelte';

/** Brand-neutral tablet bezel with a persistent, runtime-backed orientation control. */
let { spec, shell }: FrameProps = $props();

const bezel = 22;

async function toggleOrientation(): Promise<void> {
  await getRuntime().theme.setOverride({ orientation: rotate(spec).orientation });
}
</script>

<div
  data-py-frame="tablet"
  data-py-frame-shell={shell}
  data-py-device={spec.id}
  data-py-orientation={spec.orientation}
  class="pointer-events-none absolute inset-0 z-[1]"
  style:width="{spec.width}px"
  style:height="{spec.height}px"
>
  {#key spec.orientation}
    <div
      data-py-frame-decoration
      class="absolute border-solid border-zinc-800 bg-zinc-800 shadow-[0_0_0_1px_rgb(39_39_42),0_28px_70px_-24px_rgb(0_0_0/0.55)] dark:border-zinc-950 dark:bg-zinc-950 dark:shadow-[0_0_0_1px_rgb(24_24_27),0_28px_70px_-24px_rgb(0_0_0/0.75)]"
      style:inset="-{bezel}px"
      style:border-width="{bezel}px"
      style:border-radius="{spec.cornerRadius + bezel}px"
      aria-hidden="true"
    ></div>
  {/key}

  <div
    class="absolute inset-0 ring-1 ring-black/20 dark:ring-white/10"
    style:border-radius="{spec.cornerRadius}px"
    aria-hidden="true"
  ></div>

  <StatusBar {spec} />
  <HomeIndicator {spec} />
  <button
    type="button"
    data-py-orientation-toggle
    class="pointer-events-auto absolute right-3 bottom-8 z-[35] flex size-8 items-center justify-center rounded-full border border-white/20 bg-zinc-800/80 text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-zinc-950/80"
    aria-label="Rotate tablet to {spec.orientation === 'portrait' ? 'landscape' : 'portrait'}"
    title="Rotate tablet"
    onclick={toggleOrientation}
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 5.5h6.5a2 2 0 0 1 2 2V9M12.5 10.5 10.5 8.5m2 2 2-2M12 10.5H5.5a2 2 0 0 1-2-2V7M3.5 5.5l2 2m-2-2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    [data-py-frame-decoration] {
      animation: py-pop-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }
  }
</style>
