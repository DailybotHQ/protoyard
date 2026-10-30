<script lang="ts">
/** Adapter: Protoyard Sparkline → Texuli Sparkline (showLast off for KPI tiles). */
import { type ChartFormatSpec, Sparkline as TexuliSparkline } from '@texuli/charts/sparkline-lite';
import { TEXULI_CHART_TOKENS } from '../compat/theme-tokens.ts';
import { trendLabel } from './trend.ts';

type Props = {
  values?: readonly (number | null)[];
  data?: readonly (number | null)[];
  /** Accessible text; defaults to a trend sentence such as "Trend: up 12% over 30 days". */
  label?: string;
  description?: string;
  height?: number;
  showLast?: boolean;
  variant?: 'line' | 'area' | 'bar';
  period?: string;
  /** Formats values in the default trend sentence. */
  format?: (value: number) => string;
  /** Plain-data format for Texuli's own value text (tooltip, last value). */
  formatSpec?: ChartFormatSpec;
  [key: string]: unknown;
};

let {
  values,
  data,
  label,
  description,
  height = 32,
  showLast = false,
  variant,
  period,
  format,
  formatSpec,
}: Props = $props();
const series = $derived(values ?? data ?? []);
const accessible = $derived(label ?? trendLabel(series, period, format));
</script>

<!--
  Do not set aria-hidden on this wrapper: Texuli Sparkline is a labeled
  role="img" SVG. Hiding the wrapper while the SVG stays focusable fails
  axe aria-hidden-focus (WCAG). The sparkline carries its own accessible name.
-->
<div data-py-chart="" data-py-sparkline="" style={TEXULI_CHART_TOKENS}>
  <TexuliSparkline
    values={series}
    label={accessible}
    {description}
    {height}
    {showLast}
    {variant}
    {period}
    format={formatSpec}
    formatValue={format}
  />
</div>
