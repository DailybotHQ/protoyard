<script lang="ts">
import { rotate } from '@protoyard/core';
import { getRuntime } from '../../context.ts';
import HomeIndicator from './HomeIndicator.svelte';
import type { FrameProps } from './registry.ts';
import StatusBar from './StatusBar.svelte';

/**
 * Brand-neutral phone bezel: CSS/SVG only (no OS logos or trademarks).
 * Light/dark chrome follows the document color mode. Side buttons and the
 * cutout are decorative; the home indicator is a real control (go `#/`).
 */
let { spec, shell }: FrameProps = $props();

const bezel = 12;
const outerRadius = $derived(spec.cornerRadius + bezel);
const cutout = $derived(spec.cutout);

/** Side-button geometry in CSS px (decorative). */
const volumeTop = $derived(Math.round(spec.height * 0.18));
const powerTop = $derived(Math.round(spec.height * 0.28));

async function toggleOrientation(): Promise<void> {
  await getRuntime().theme.setOverride({ orientation: rotate(spec).orientation });
}
</script>

<!--
  Frame is a sibling overlay on the device box (ShellHost). pointer-events none
  except HomeIndicator's button. Status bar paints inside the top safe inset.
-->
<div
  data-py-frame="phone"
  data-py-frame-shell={shell}
  data-py-device={spec.id}
  data-py-orientation={spec.orientation}
  data-py-cutout={cutout}
  class="pointer-events-none absolute inset-0 z-[1]"
  style:width="{spec.width}px"
  style:height="{spec.height}px"
>
  <!-- Outer bezel ring; remounting this decoration replays the orientation cue. -->
  {#key spec.orientation}
    <!-- The bezel is the border ring only: a fill here would paint over the app's screen. -->
    <div
      data-py-frame-decoration
      class="absolute border-solid border-zinc-800 bg-transparent shadow-[0_0_0_1px_rgb(39_39_42),0_28px_70px_-24px_rgb(0_0_0/0.55)] dark:border-zinc-950 dark:shadow-[0_0_0_1px_rgb(24_24_27),0_28px_70px_-24px_rgb(0_0_0/0.75)]"
      style:inset="-{bezel}px"
      style:border-width="{bezel}px"
      style:border-radius="{outerRadius}px"
      aria-hidden="true"
    ></div>
  {/key}

  <!-- Inner screen lip -->
  <div
    class="absolute inset-0 ring-1 ring-black/20 dark:ring-white/10"
    style:border-radius="{spec.cornerRadius}px"
    aria-hidden="true"
  ></div>

  <!-- Volume rocker (left) -->
  <div class="absolute -left-[15px] flex w-[3px] flex-col gap-2" style:top="{volumeTop}px" aria-hidden="true">
    <span class="h-7 rounded-l-sm bg-zinc-700 dark:bg-zinc-900"></span>
    <span class="h-7 rounded-l-sm bg-zinc-700 dark:bg-zinc-900"></span>
  </div>
  <!-- Power (right) -->
  <div
    class="absolute -right-[15px] h-14 w-[3px] rounded-r-sm bg-zinc-700 dark:bg-zinc-900"
    style:top="{powerTop}px"
    aria-hidden="true"
  ></div>

  <!-- Camera cutout -->
  {#if cutout === 'pill'}
    <div
      class="absolute top-[11px] left-1/2 z-[25] h-[28px] w-[96px] -translate-x-1/2 rounded-full bg-zinc-950 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.5)] dark:bg-black"
      aria-hidden="true"
      data-py-cutout-shape="pill"
    >
      <span
        class="absolute top-1/2 left-[22%] size-[9px] -translate-y-1/2 rounded-full bg-zinc-800 ring-1 ring-zinc-700/80"
      ></span>
    </div>
  {:else if cutout === 'punch-hole'}
    <div
      class="absolute top-[12px] left-1/2 z-[25] size-[11px] -translate-x-1/2 rounded-full bg-zinc-950 ring-1 ring-zinc-700 dark:bg-black"
      aria-hidden="true"
      data-py-cutout-shape="punch-hole"
    ></div>
  {/if}

  <StatusBar {spec} />
  <HomeIndicator {spec} />
  <button
    type="button"
    data-py-orientation-toggle
    class="pointer-events-auto absolute right-2 bottom-8 z-[35] flex size-8 items-center justify-center rounded-full border border-white/20 bg-zinc-800/80 text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-zinc-950/80"
    aria-label="Rotate phone to {spec.orientation === 'portrait' ? 'landscape' : 'portrait'}"
    title="Rotate phone"
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
