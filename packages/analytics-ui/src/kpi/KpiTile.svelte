<script lang="ts">
import { Sparkline } from '@texuli/charts/compact';
import { Kpi } from 'texuli/stat';
import type { KpiUnit } from './format.ts';

type Props = {
  label: string;
  value: number | null | undefined;
  unit?: KpiUnit;
  currency?: string;
  previous?: number | null;
  comparisonLabel?: string;
  positive?: 'up' | 'down';
  trend?: readonly (number | null)[];
  trendPeriod?: string;
  href?: string;
  loading?: boolean;
  empty?: boolean | string;
  class?: string;
};

let {
  label,
  value,
  unit = 'number',
  currency = 'USD',
  previous,
  comparisonLabel = 'vs previous period',
  positive = 'up',
  trend,
  trendPeriod,
  href,
  loading = false,
  empty = false,
  class: className = '',
}: Props = $props();
</script>

{#snippet spark()}
  {#if trend && trend.length > 1}
    <Sparkline values={trend} label={`${label} trend`} period={trendPeriod} height={28} />
  {/if}
{/snippet}

<Kpi
  {label}
  {value}
  {unit}
  {currency}
  {previous}
  {comparisonLabel}
  {positive}
  {href}
  {loading}
  {empty}
  sparkline={trend && trend.length > 1 ? spark : undefined}
  class={className}
  data-protoyard-kpi=""
/>
