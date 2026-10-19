<script lang="ts">
import { divergingColor, RAMP_STEPS, sequentialColor } from '@protoyard/charts/palette';

let {
  min,
  max,
  format,
  diverging = false,
  label = 'Scale',
  emptyLabel,
}: {
  min: number;
  max: number;
  format: (value: number) => string;
  diverging?: boolean;
  label?: string;
  /** Explains the swatch for missing values ("No data"); omitted when not needed. */
  emptyLabel?: string;
} = $props();

const steps = Array.from({ length: RAMP_STEPS }, (_, i) => i / (RAMP_STEPS - 1));
</script>

<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" role="group" aria-label={label}>
  <span class="tabular-nums" data-ramp-min="">{format(min)}</span>
  <span class="inline-flex overflow-hidden rounded-sm" aria-hidden="true">
    {#each steps as t (t)}
      <span class="h-2.5 w-4" style:background={diverging ? divergingColor(t * 2 - 1) : sequentialColor(t)}></span>
    {/each}
  </span>
  <span class="tabular-nums" data-ramp-max="">{format(max)}</span>
  <span class="sr-only">Darker cells mean higher values{diverging ? '; the middle color is the midpoint' : ''}.</span>
  {#if emptyLabel}
    <span class="inline-flex items-center gap-1">
      <span class="size-2.5 rounded-sm border border-dashed border-border" aria-hidden="true"></span>{emptyLabel}
    </span>
  {/if}
</div>
