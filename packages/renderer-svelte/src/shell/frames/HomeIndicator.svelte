<script lang="ts">
import type { DeviceSpec } from '@protoyard/core';
import { safeAreaOf } from '@protoyard/core';

/**
 * Brand-neutral home indicator. Clicking it navigates to the app root (`#/`) —
 * a real "go home" gesture, not a dead control. The bar itself is decorative.
 * Its hit area is exactly the bottom safe-area inset, which apps keep free
 * (`pb-safe`), so it never takes a tap meant for app content.
 */
let { spec }: { spec: DeviceSpec } = $props();

const insets = $derived(safeAreaOf(spec));
const barHeight = $derived(Math.max(4, Math.min(6, Math.round(spec.homeIndicator.height * 0.2))));
const hitHeight = $derived(insets.bottom);

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

{#if spec.homeIndicator.height > 0 && hitHeight > 0}
  <div
    data-py-home-indicator
    class="absolute inset-x-0 bottom-0 z-[30] flex justify-center"
    style:height="{hitHeight}px"
  >
    <button
      type="button"
      class="pointer-events-auto box-border flex h-full w-full max-w-[40%] cursor-pointer items-end justify-center border-0 bg-transparent px-2 pt-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style:padding-bottom="{Math.max(4, Math.round(insets.bottom * 0.25))}px"
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
