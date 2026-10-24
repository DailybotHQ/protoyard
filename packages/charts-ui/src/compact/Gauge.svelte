<script lang="ts">
/** Re-export wrapper: Protoyard Gauge → Texuli Gauge. */
import { Gauge as TexuliGauge } from '@texuli/charts/compact';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  label: string;
  value: number;
  max?: number;
  description?: string;
  [key: string]: unknown;
};

let { label, value, max = 100, description }: Props = $props();
</script>

<ChartRoot title={label}>
<TexuliGauge {label} {value} {max} {description} />
</ChartRoot>


