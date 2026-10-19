<script lang="ts">
import { Sparkline } from '@protoyard/charts-ui/compact';
import { StatCard } from '@protoyard/ui';
import type { ComponentProps } from 'svelte';

/**
 * A StatCard with a 30-day sparkline along its bottom edge. The sparkline
 * speaks its own trend sentence ("Trend: up 12% over 30 days"), so the
 * numbers stay available without hovering.
 */
type Props = ComponentProps<typeof StatCard> & {
  trendValues: readonly number[];
  trendPeriod?: string;
  trendFormat?: (value: number) => string;
};

let {
  trendValues,
  trendPeriod = '30 days',
  trendFormat,
  class: className = '',
  ...card
}: Props = $props();
</script>

<div class="relative">
  <StatCard {...card} class="h-full pb-14 {className}" />
  <div class="pointer-events-none absolute inset-x-5 bottom-4">
    <Sparkline values={trendValues} variant="area" period={trendPeriod} format={trendFormat} height={28} />
  </div>
</div>
