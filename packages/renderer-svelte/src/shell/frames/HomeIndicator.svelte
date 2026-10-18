<script lang="ts">
import type { DeviceSpec } from '@protoyard/core';
import { safeAreaOf } from '@protoyard/core';

/**
 * Brand-neutral home indicator. Clicking it navigates to the app root (`#/`) —
 * a real "go home" gesture, not a dead control. The bar itself is decorative.
 */
let { spec }: { spec: DeviceSpec } = $props();

const insets = $derived(safeAreaOf(spec));
const barHeight = $derived(Math.max(4, Math.min(6, Math.round(spec.homeIndicator.height * 0.2))));
const hitHeight = $derived(Math.max(spec.homeIndicator.height, insets.bottom, 20));

function goHome(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  // Hash router root — same gesture as a physical home button on a phone shell.
  const url = new URL(location.href);
  url.hash = '#/';
  // Drop query/query noise that is not a route (keep scenario link params in search).
  location.assign(`${url.pathname}${url.search}#/`);
}
</script>

{#if spec.homeIndicator.height > 0}
  <div
    data-py-home-indicator
    class="absolute inset-x-0 bottom-0 z-[30] flex items-end justify-center"
    style:height="{hitHeight}px"
    style:padding-bottom="{Math.max(8, Math.round(insets.bottom * 0.25))}px"
  >
    <button
      type="button"
      class="pointer-events-auto flex w-full max-w-[40%] cursor-pointer items-center justify-center border-0 bg-transparent p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label="Go home"
      title="Go home"
      onclick={goHome}
    >
      <span
        class="block rounded-full bg-foreground/35 dark:bg-foreground/50"
        style:width="36%"
        style:min-width="100px"
        style:max-width="140px"
        style:height="{barHeight}px"
        aria-hidden="true"
      ></span>
    </button>
  </div>
{/if}
