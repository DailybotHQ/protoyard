<script lang="ts">
import type { FrameProps } from './registry.ts';

/**
 * Generic, brand-neutral device bezel: a dark ring around the screen with the
 * device's corner radius. Decoration only. The detailed phone and tablet
 * frames (cutout, status bar, home indicator) replace it per shell.
 */
let { spec, shell }: FrameProps = $props();
const bezel = 14;
</script>

<div
  aria-hidden="true"
  data-py-frame="device"
  data-py-frame-shell={shell}
  class="pointer-events-none absolute z-[1] border-solid border-foreground dark:border-background shadow-[0_0_0_1px_var(--color-border-strong),0_30px_80px_-30px_var(--color-shadow)]"
  style:inset="-{bezel}px"
  style:border-width="{bezel}px"
  style:border-radius="{spec.cornerRadius + bezel}px"
></div>
