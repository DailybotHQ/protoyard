<script lang="ts">
/** Minimal ramp legend using sequential CSS vars. */
import { RAMP_STEPS, sequentialColor } from '@protoyard/charts/palette';

type Props = { label?: string; [key: string]: unknown };
let { label = 'Scale' }: Props = $props();
const steps = $derived(
  Array.from({ length: RAMP_STEPS }, (_, i) => sequentialColor(i / (RAMP_STEPS - 1)))
);
</script>

<div class="ramp" role="img" aria-label={label}>
  {#each steps as color, i (i)}
    <span class="swatch" style:background={color}></span>
  {/each}
</div>

<style>
  .ramp {
    display: flex;
    gap: 1px;
    min-block-size: 0.5rem;
  }
  .swatch {
    flex: 1;
    min-block-size: 0.5rem;
  }
</style>
