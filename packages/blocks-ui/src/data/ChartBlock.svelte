<script lang="ts">
/**
 * ChartSpec → Texuli chart adapter. Loads `@texuli/charts` once per kind.
 */
import type { ChartBlock as ChartBlockData } from '@protoyard/blocks';
import type { Component } from 'svelte';
import { toTexuliChartBlock } from '../compat/chart-spec.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

let { block }: { block: ChartBlockData } = $props();

const payload = $derived(toTexuliChartBlock(block));
let Chart = $state<Component<Record<string, unknown>> | null>(null);
let loadError = $state('');
let loadedKind = $state<string | null>(null);

$effect(() => {
  const p = payload;
  if (!p) {
    Chart = null;
    loadedKind = null;
    loadError = '';
    return;
  }
  const kind = p.kind;
  if (loadedKind === kind && Chart) return;

  let cancelled = false;
  loadError = '';
  void (async () => {
    try {
      let next: Component<Record<string, unknown>> | null = null;
      if (kind === 'heatmap') {
        const mod = await import('@texuli/charts/matrix');
        next = mod.HeatmapChart as unknown as Component<Record<string, unknown>>;
      } else if (kind === 'scatter' || kind === 'bubble') {
        const mod = await import('@texuli/charts/matrix');
        next = (kind === 'bubble' ? mod.BubbleChart : mod.ScatterChart) as unknown as Component<
          Record<string, unknown>
        >;
      } else {
        const mod = await import('@texuli/charts/cartesian');
        const map: Record<string, unknown> = {
          line: mod.LineChart,
          area: mod.AreaChart,
          bar: mod.BarChart,
          'stacked-bar': mod.StackedBarChart,
        };
        next = (map[kind] ?? mod.BarChart) as Component<Record<string, unknown>>;
      }
      if (!cancelled) {
        Chart = next;
        loadedKind = kind;
      }
    } catch (error) {
      if (!cancelled) {
        loadError = error instanceof Error ? error.message : 'Chart failed to load';
        Chart = null;
        loadedKind = null;
      }
    }
  })();

  return () => {
    cancelled = true;
  };
});
</script>

<figure
  class="m-0"
  data-py-block="chart"
  data-py-chart=""
  data-chart-kind={payload?.kind}
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
>
  {#if !payload}
    <div
      role="note"
      class="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm"
      data-chart-error
    >
      <p class="font-medium">This chart could not be shown.</p>
    </div>
  {:else if loadError}
    <p role="note">{loadError}</p>
  {:else if Chart && payload}
    <Chart title={payload.title} description={payload.description} series={payload.series} />
  {:else}
    <p role="status">Loading chart…</p>
  {/if}
</figure>
