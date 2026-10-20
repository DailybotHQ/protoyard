<script lang="ts">
import type { Rect } from '@protoyard/charts';

let {
  orientation = 'horizontal',
  positions,
  plot,
}: {
  /** `horizontal`: lines across the plot at y positions; `vertical`: at x positions. */
  orientation?: 'horizontal' | 'vertical';
  positions: readonly number[];
  plot: Rect;
} = $props();
</script>

<g aria-hidden="true" stroke="var(--py-chart-grid, var(--py-border))" data-grid={orientation}>
  <!-- Keyed by index: positions collide when the plot area collapses to zero width or height. -->
  {#each positions as p, i (i)}
    {#if orientation === 'horizontal'}
      <line x1={plot.x} x2={plot.x + plot.width} y1={p} y2={p} />
    {:else}
      <line x1={p} x2={p} y1={plot.y} y2={plot.y + plot.height} />
    {/if}
  {/each}
</g>
