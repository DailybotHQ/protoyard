<script lang="ts">
/** Adapter: Protoyard RadialProgress → Texuli ProgressRing. */
import { ProgressRing } from '@texuli/charts/compact';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  label: string;
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  [key: string]: unknown;
};

let { label, value, max = 1, size = 64, thickness = 7 }: Props = $props();
</script>

<ChartRoot title={label}>
<ProgressRing {label} {value} {max} {size} {thickness} />
</ChartRoot>


