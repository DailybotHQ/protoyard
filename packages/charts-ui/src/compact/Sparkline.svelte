<script lang="ts">
/** Adapter: Protoyard Sparkline → Texuli Sparkline (showLast off for KPI tiles). */
import { Sparkline as TexuliSparkline } from '@texuli/charts/compact';

type Props = {
  values?: readonly (number | null)[];
  data?: readonly (number | null)[];
  label?: string;
  description?: string;
  height?: number;
  showLast?: boolean;
  [key: string]: unknown;
};

let { values, data, label = 'Trend', description, height = 32, showLast = false }: Props = $props();
const series = $derived(values ?? data ?? []);
</script>

<!--
  Do not set aria-hidden on this wrapper: Texuli Sparkline is a labeled
  role="img" SVG. Hiding the wrapper while the SVG stays focusable fails
  axe aria-hidden-focus (WCAG). The sparkline carries its own accessible name.
-->
<div data-py-chart="" data-py-sparkline="">
  <TexuliSparkline values={series} {label} {description} {height} {showLast} />
</div>
