<script lang="ts">
import type { DeviceSpec } from '@protoyard/core';
import { safeAreaOf } from '@protoyard/core';

/**
 * Brand-neutral status bar chrome drawn in the top safe-area inset.
 * Decorative glyphs are aria-hidden; the clock is a real `<time>` (status-bar-live
 * will drive it from the runtime clock).
 */
let { spec }: { spec: DeviceSpec } = $props();

const insets = $derived(safeAreaOf(spec));
const height = $derived(Math.max(spec.statusBar.height, insets.top));
const style = $derived(spec.statusBar.style);

/** Placeholder until T-shells-status-bar-live wires useClock(). */
const clockLabel = '9:41';
</script>

{#if style !== 'none'}
  <div
    data-py-status-bar
    data-py-status-style={style}
    class="pointer-events-none absolute inset-x-0 top-0 z-[30] flex items-end px-5 pb-1.5 text-[12px] leading-none font-semibold tracking-tight text-foreground"
    style:height="{height}px"
    style:padding-top="{Math.max(0, insets.top - spec.statusBar.height)}px"
  >
    {#if style === 'split'}
      <!-- Time is the only non-decorative control; glyphs sit left/right of the cutout. -->
      <time class="min-w-[3.25rem] tabular-nums" datetime="09:41">{clockLabel}</time>
      <div class="min-w-0 flex-1" aria-hidden="true"></div>
      <div class="flex items-center gap-1.5" aria-hidden="true">
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" class="opacity-90">
          <rect x="0" y="8" width="2.5" height="4" rx="0.5" />
          <rect x="3.5" y="5.5" width="2.5" height="6.5" rx="0.5" />
          <rect x="7" y="3" width="2.5" height="9" rx="0.5" />
          <rect x="10.5" y="0.5" width="2.5" height="11.5" rx="0.5" opacity="0.35" />
        </svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none" class="opacity-90">
          <rect x="0.5" y="1" width="20" height="10" rx="2.5" stroke="currentColor" stroke-width="1.2" />
          <rect x="2" y="2.75" width="14" height="6.5" rx="1.2" fill="currentColor" />
          <path d="M22 4.5v3a1.75 1.75 0 0 0 0-3Z" fill="currentColor" opacity="0.45" />
        </svg>
      </div>
    {:else}
      <time class="min-w-[3.25rem] tabular-nums" datetime="09:41">{clockLabel}</time>
      <div class="min-w-0 flex-1" aria-hidden="true"></div>
      <div class="flex items-center gap-1.5" aria-hidden="true">
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" class="opacity-90">
          <rect x="0" y="8" width="2.5" height="4" rx="0.5" />
          <rect x="3.5" y="5.5" width="2.5" height="6.5" rx="0.5" />
          <rect x="7" y="3" width="2.5" height="9" rx="0.5" />
          <rect x="10.5" y="0.5" width="2.5" height="11.5" rx="0.5" />
        </svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none" class="opacity-90">
          <rect x="0.5" y="1" width="20" height="10" rx="2.5" stroke="currentColor" stroke-width="1.2" />
          <rect x="2" y="2.75" width="17" height="6.5" rx="1.2" fill="currentColor" />
          <path d="M22 4.5v3a1.75 1.75 0 0 0 0-3Z" fill="currentColor" opacity="0.45" />
        </svg>
      </div>
    {/if}
  </div>
{/if}
