<script lang="ts">
/** Re-export wrapper: Protoyard Gauge → Texuli Gauge. */
import { type ChartFormatSpec, Gauge as TexuliGauge } from '@texuli/charts/compact';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  description?: string;
  thresholds?: readonly number[];
  bandLabels?: readonly string[];
  /** Plain-data number or date format (Texuli's JSON-safe spec). */
  format?: ChartFormatSpec;
  [key: string]: unknown;
};

let { label, value, min, max = 100, description, thresholds, bandLabels, format }: Props = $props();
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
