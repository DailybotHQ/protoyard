<script lang="ts">
/** Backward-compatible props for Texuli's accessible matrix color legend. */
import { RampLegend as TexuliRampLegend } from '@texuli/charts/matrix';

type Props = {
  label?: string;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  ramp?: 'sequential' | 'diverging';
  steps?: number;
  formatValue?: (value: number) => string;
  description?: string;
  class?: string;
};

let {
  label = 'Scale',
  min,
  max,
  minLabel,
  maxLabel,
  ramp,
  steps,
  formatValue,
  description,
  class: className,
}: Props = $props();
</script>

<TexuliRampLegend
  {label}
  {min}
  {max}
  {minLabel}
  {maxLabel}
  {ramp}
  {steps}
  {formatValue}
  {description}
  class={className}
/>
