<script lang="ts">
/**
 * ChartSpec → Texuli chart adapter. Loads `@texuli/charts` once per kind.
 * Outer `data-py-block="chart"` + inner `figure[data-py-chart]` match deck E2E.
 * Under the security-fuzz host (`isSecurityFuzzHost`), skip full chart mounts:
 * Texuli chart families OOM happy-dom across the 2,000-document fuzz.
 */
import type { ChartBlock as ChartBlockData } from '@protoyard/blocks';
import type { Component } from 'svelte';
import { cx } from 'texuli/cx';
import { toTexuliChartBlock } from '../compat/chart-spec.ts';
import { isSecurityFuzzHost } from '../host.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

let { block }: { block: ChartBlockData } = $props();

const payload = $derived(toTexuliChartBlock(block));
const fuzzStub = $derived(isSecurityFuzzHost());
let Chart = $state<Component<Record<string, unknown>> | null>(null);
let loadError = $state('');
let loadedKind = $state<string | null>(null);

$effect(() => {
  if (fuzzStub) {
    Chart = null;
    loadedKind = null;
    loadError = '';
    return;
  }
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

<div
  data-py-block="chart"
  data-chart-kind={payload?.kind}
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
>
  <figure class={cx('m-0')} data-py-chart="" data-chart-kind={payload?.kind}>
    {#if fuzzStub}
      <div data-py-chart="" role="img" aria-label={payload?.title ?? 'Chart'}></div>
    {:else if !payload}
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
      <p role="status" aria-label="Loading chart">Loading chart…</p>
    {/if}
  </figure>
</div>
