<script lang="ts">
/** Re-export wrapper: Protoyard Gauge → Texuli Gauge. */
import { Gauge as TexuliGauge } from '@texuli/charts/compact';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  description?: string;
  thresholds?: readonly number[];
  bandLabels?: readonly string[];
  format?: (value: number) => string;
  [key: string]: unknown;
};

let {
  label,
  value,
  min,
  max = 100,
  description,
  thresholds,
  bandLabels,
  format,
}: Props = $props();
</script>

<ChartRoot title={label}>
  <TexuliGauge
    {label}
    {value}
    {min}
    {max}
    {description}
    {thresholds}
    {bandLabels}
    {format}
  />
</ChartRoot>
