<script lang="ts">
import { Minus, TrendingDown, TrendingUp } from '@lucide/svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { cn } from '../../lib/cn.ts';
import type { IconComponent } from '../../lib/types.ts';
import { formatDelta, resolveTrend, type Trend, trendTone, trendWord } from './trend.ts';

type Props = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: string | number;
  /** Change vs. the previous period, e.g. "+12%" or 12 (numbers get a sign). */
  delta?: string | number;
  /** Defaults to the sign of a numeric delta. */
  trend?: Trend;
  /** Which direction is good; `down` suits metrics like churn or latency. */
  positive?: 'up' | 'down';
  hint?: string;
  icon?: IconComponent;
};

let {
  label,
  value,
  delta,
  trend,
  positive = 'up',
  hint,
  icon: Icon,
  class: className,
  ...rest
}: Props = $props();

const resolvedTrend = $derived(resolveTrend(delta, trend));
const deltaText = $derived(formatDelta(delta));
const tone = $derived(trendTone(resolvedTrend, positive));
const word = $derived(trendWord(resolvedTrend));
const TrendIcon = $derived(
  resolvedTrend === 'up' ? TrendingUp : resolvedTrend === 'down' ? TrendingDown : Minus
);
</script>

<div
  class={cn(
    'flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 text-surface-foreground shadow-soft',
    className
  )}
  {...rest}
>
  <div class="flex items-center justify-between gap-2">
    <p class="text-sm font-medium text-muted-foreground">{label}</p>
    {#if Icon}
      <span class="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
        <Icon class="size-4" />
      </span>
    {/if}
  </div>
  <p class="font-heading text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
  {#if deltaText !== undefined || hint}
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {#if deltaText !== undefined}
        <span class={cn('inline-flex items-center gap-1 font-medium tabular-nums', tone)}>
          <TrendIcon class="size-3.5" aria-hidden="true" />
          <span class="sr-only">{word}:</span>
          {deltaText}
        </span>
      {/if}
      {#if hint}<span class="text-muted-foreground">{hint}</span>{/if}
    </div>
  {/if}
</div>
