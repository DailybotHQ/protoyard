<script lang="ts">
import type { StatBlock as StatBlockData } from '@protoyard/blocks';
import { cn } from '@protoyard/ui';
import { TONE_INDICATOR, TONE_LABELS } from './format.ts';

/**
 * A stat/KPI row: each figure is a term (label) with its value, an optional
 * delta (its tone is a colored dot plus words for screen readers, so color is
 * never the only signal), context and a sparkline. The sparkline loads from
 * `@protoyard/charts-ui/compact` only when a figure has a trend.
 */
let { block }: { block: StatBlockData } = $props();

const hasTrend = $derived(block.items.some((item) => item.trend !== undefined));
const name = $derived(block.title ?? 'Key figures');
</script>

<section aria-label={name} class="grid gap-3" data-py-block="stat">
  {#if block.title}<p class="text-sm font-semibold text-muted-foreground">{block.title}</p>{/if}
  <dl class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
    {#each block.items as item, i (i)}
      <div class="grid content-start gap-1 rounded-lg border border-border bg-surface p-4">
        <dt class="text-sm text-muted-foreground">{item.label}</dt>
        <dd class="text-3xl font-semibold tracking-tight tabular-nums">{item.value}</dd>
        {#if item.delta}
          {@const tone = item.deltaTone ?? 'neutral'}
          <dd class="flex items-center gap-1.5 text-sm font-medium tabular-nums">
            <span aria-hidden="true" class={cn('size-2 shrink-0 rounded-full', TONE_INDICATOR[tone])}></span>
            <span>{item.delta}</span>{#if TONE_LABELS[tone]}<span class="sr-only">{` (${TONE_LABELS[tone]})`}</span>{/if}
          </dd>
        {/if}
        {#if item.context}<dd class="text-xs text-muted-foreground">{item.context}</dd>{/if}
        {#if item.trend && hasTrend}
          <dd class="mt-1">
            {#await import('@protoyard/charts-ui/compact') then { Sparkline }}
              <Sparkline values={item.trend} label={`${item.label} trend`} height={28} />
            {:catch}
              <span class="sr-only">Trend unavailable</span>
            {/await}
          </dd>
        {/if}
      </div>
    {/each}
  </dl>
  {#if block.source}<p class="text-xs text-muted-foreground">Source: {block.source}</p>{/if}
</section>
