<script lang="ts">
import type { Snippet } from 'svelte';
import { tooltipPosition } from './model.ts';

let {
  anchor,
  bounds,
  children,
}: {
  /** The point the tooltip describes, in the plot's pixel space. */
  anchor: { x: number; y: number };
  bounds: { width: number; height: number };
  children: Snippet;
} = $props();

let width = $state(0);
let height = $state(0);
const box = $derived(tooltipPosition(anchor, { width, height }, bounds));
</script>

<!-- Hidden from assistive tech: the plot's live region already announces the same text. -->
<div
  aria-hidden="true"
  data-chart-tooltip=""
  class="pointer-events-none absolute z-10 min-w-32 rounded-lg border border-border bg-elevated px-2.5 py-2 text-xs text-foreground shadow-soft"
  style:left="{box.left}px"
  style:top="{box.top}px"
  bind:offsetWidth={width}
  bind:offsetHeight={height}
>
  {@render children()}
</div>
