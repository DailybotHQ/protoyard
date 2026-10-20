<script lang="ts">
import type { Rect } from '@protoyard/charts';

/** Decorative axis: values reach assistive tech through the live region, tooltip and table. */
let {
  orientation,
  ticks,
  plot,
  title,
}: {
  orientation: 'bottom' | 'left' | 'right' | 'top';
  /** Pixel position along the axis and the label to print there. */
  ticks: readonly { position: number; label: string }[];
  plot: Rect;
  title?: string;
} = $props();

const horizontal = $derived(orientation === 'bottom' || orientation === 'top');
const at = $derived(
  orientation === 'bottom'
    ? plot.y + plot.height
    : orientation === 'top'
      ? plot.y
      : orientation === 'left'
        ? plot.x
        : plot.x + plot.width
);
const outward = $derived(orientation === 'bottom' || orientation === 'right' ? 1 : -1);
</script>

<g aria-hidden="true" class="text-[11px]" style="color: var(--py-chart-axis, var(--py-muted-foreground))" data-axis={orientation}>
  {#if horizontal}
    <line x1={plot.x} x2={plot.x + plot.width} y1={at} y2={at} stroke="currentColor" stroke-opacity="0.5" />
    <!-- Keyed by index: positions collide when the plot area collapses to zero width or height. -->
    {#each ticks as tick, i (i)}
      <line x1={tick.position} x2={tick.position} y1={at} y2={at + 4 * outward} stroke="currentColor" stroke-opacity="0.5" />
      <text
        x={tick.position}
        y={at + (outward > 0 ? 16 : -8)}
        text-anchor="middle"
        fill="currentColor">{tick.label}</text
      >
    {/each}
    {#if title}
      <text x={plot.x + plot.width} y={at + (outward > 0 ? 30 : -22)} text-anchor="end" fill="currentColor">{title}</text>
    {/if}
  {:else}
    <line x1={at} x2={at} y1={plot.y} y2={plot.y + plot.height} stroke="currentColor" stroke-opacity="0.5" />
    {#each ticks as tick, i (i)}
      <text
        x={at - 8 * -outward}
        y={tick.position}
        dy="0.32em"
        text-anchor={outward < 0 ? 'end' : 'start'}
        fill="currentColor">{tick.label}</text
      >
    {/each}
    {#if title}
      <text x={at} y={plot.y - 8} text-anchor={outward < 0 ? 'start' : 'end'} fill="currentColor">{title}</text>
    {/if}
  {/if}
</g>
