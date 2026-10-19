<script lang="ts">
import { Minus, TrendingDown, TrendingUp } from '@lucide/svelte';
import { Sparkline } from '@protoyard/charts-ui/compact';
import { resolveTrend, trendTone, trendWord } from '@protoyard/ui';
import { formatKpi, type KpiUnit, kpiDelta } from './format.ts';

type Props = {
  label: string;
  value: number | null | undefined;
  unit?: KpiUnit;
  currency?: string;
  /** The comparison value (e.g. the previous period); the delta is computed from it. */
  previous?: number | null;
  /** Shown after the delta. */
  comparisonLabel?: string;
  /** Which direction is good; `down` suits churn, latency or cost. */
  positive?: 'up' | 'down';
  /** Values for the sparkline (oldest first). */
  trend?: readonly (number | null)[];
  /** Period for the sparkline's spoken trend, e.g. "30 days". */
  trendPeriod?: string;
  /** Turns the tile into a link to a detail view (drill-down). */
  href?: string;
  loading?: boolean;
  /** `true` or a message when there is no value yet. */
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

const uid = $props.id();
const change = $derived(kpiDelta(value, previous, unit, currency));
const direction = $derived(resolveTrend(change?.absolute ?? null));
const Icon = $derived(
  direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus
);
const isEmpty = $derived(!loading && (empty !== false || value === null || value === undefined));
const emptyText = $derived(typeof empty === 'string' ? empty : 'No data yet');
</script>

<article
  aria-labelledby="{uid}-label"
  aria-busy={loading ? 'true' : undefined}
  class="relative flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-surface-foreground shadow-soft {href
    ? 'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring hover:border-ring/60'
    : ''} {className}"
>
  <p id="{uid}-label" class="m-0 text-sm font-medium text-muted-foreground">
    {#if href}
      <!-- The link covers the whole tile; its name is the label plus the value. -->
      <a {href} class="outline-none after:absolute after:inset-0 after:content-['']" aria-describedby="{uid}-value">{label}</a>
    {:else}
      {label}
    {/if}
  </p>
  {#if loading}
    <div class="h-8 w-28 animate-pulse rounded bg-muted"></div>
    <div class="h-4 w-20 animate-pulse rounded bg-muted"></div>
  {:else if isEmpty}
    <p id="{uid}-value" class="m-0 font-heading text-2xl font-semibold text-muted-foreground">—</p>
    <p class="m-0 text-xs text-muted-foreground">{emptyText}</p>
  {:else}
    <p id="{uid}-value" class="m-0 font-heading text-2xl font-semibold tracking-tight tabular-nums">{formatKpi(value, unit, currency)}</p>
    {#if change}
      <p class="m-0 flex flex-wrap items-center gap-x-1.5 text-xs" data-kpi-delta={direction}>
        <span class="inline-flex items-center gap-1 font-medium tabular-nums {trendTone(direction, positive)}">
          <Icon class="size-3.5" aria-hidden="true" />
          <span class="sr-only">{trendWord(direction)}:</span>
          {change.text}
        </span>
        <span class="text-muted-foreground">{comparisonLabel}</span>
      </p>
    {/if}
    {#if trend && trend.length > 1}
      <Sparkline values={trend} period={trendPeriod} height={28} color="var(--py-chart1)" />
    {/if}
  {/if}
</article>
