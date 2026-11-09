<script lang="ts">
import { Sparkline } from '@protoyard/charts-ui/compact';
import type { StatCard } from '@protoyard/ui';
import type { ComponentProps } from 'svelte';
import { Icon } from 'texuli/icons';
import { Stat } from 'texuli/stat';

/**
 * A stat with a 30-day sparkline in Texuli's own sparkline slot. The
 * sparkline speaks its own trend sentence ("Trend: up 12% over 30 days"), so
 * the numbers stay available without hovering.
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
  icon,
  ref = $bindable(null),
  ...card
}: Props = $props();
</script>

{#snippet statIcon()}
  {#if icon}<Icon {icon} aria-hidden="true" />{/if}
{/snippet}

<Stat bind:ref {...card} icon={icon ? statIcon : undefined}>
  {#snippet sparkline()}
    <Sparkline values={trendValues} variant="area" period={trendPeriod} format={trendFormat} height={28} />
  {/snippet}
</Stat>
