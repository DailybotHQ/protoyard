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
  /**
   * A JSON format spec is applied by the Texuli chart to every painted value.
   * Texuli's compact charts take no formatter callbacks: a function is accepted
   * for compatibility and the gauge then uses the default number format.
   */
  format?: ChartFormatSpec | ((value: number) => string);
  [key: string]: unknown;
};

let { label, value, min, max = 100, description, thresholds, bandLabels, format }: Props = $props();
const spec = $derived(typeof format === 'function' ? undefined : format);
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
    format={spec}
  />
</ChartRoot>
