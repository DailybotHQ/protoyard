<script lang="ts">
import Icon from './Icon.svelte';

/**
 * A labelled "Full screen" control above the frame's top-right corner
 * (ShellHost places it in the device box, past the bezel, inside the frame
 * margin), so it never covers app pixels. Shift+click also asks the browser
 * for real full screen.
 */
let {
  offset = 0,
  onenter,
}: {
  /** Decoration outside the device box (the bezel), in CSS px. */
  offset?: number;
  onenter: (options: { browser: boolean }) => void;
} = $props();

/** Gap between the frame and the control, like the rotate button. */
const GAP = 8;
</script>

<button
  type="button"
  data-py-frame-toggle
  aria-label="Show full screen"
  aria-pressed="false"
  title="Show full screen (Esc returns to the frame; Shift+click for browser full screen)"
  style:bottom="calc(100% + {offset + GAP}px)"
  style:right="{-offset}px"
  class="pointer-events-auto absolute z-[35] inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-zinc-800/85 px-3 text-xs font-medium text-white shadow-sm hover:bg-zinc-700/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-zinc-950/85"
  onclick={(event) => onenter({ browser: event.shiftKey })}
>
  <Icon name="expand" class="size-3.5" />
  <span aria-hidden="true">Full screen</span>
</button>
