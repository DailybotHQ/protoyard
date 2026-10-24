<script lang="ts">
/**
 * Adapter: Protoyard cartesian ScatterChart (series[]) → Texuli matrix ScatterChart (points[]).
 */
import { ScatterChart as TexuliScatterChart } from '@texuli/charts/matrix';
import ChartRoot from '../compat/ChartRoot.svelte';
import type { CartesianSeries } from '../compat/series.ts';

type Props = {
  title: string;
  description?: string;
  series: readonly CartesianSeries[];
  emptyMessage?: string;
  class?: string;
  height?: number;
  [key: string]: unknown;
};

let { title, description, series, emptyMessage, class: className, height = 360 }: Props = $props();

const desc = $derived(description ?? emptyMessage ?? title);
const points = $derived(
  series.flatMap((s) =>
    s.points
      .filter((p) => p.y !== null && Number.isFinite(p.y))
      .map((p, i) => ({
        id: `${s.id}-${i}`,
        label: `${s.label} ${String(p.x)}`,
        x: typeof p.x === 'number' ? p.x : i,
        y: p.y as number,
        r: p.size,
        seriesId: s.id,
        color: s.color,
      }))
  )
);
const texSeries = $derived(
  series.map((s) => ({ id: s.id, label: s.label, ...(s.color ? { color: s.color } : {}) }))
);
</script>

<ChartRoot title={title}>
{#if points.length === 0}
  <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
{:else}
  <TexuliScatterChart
    {title}
    description={desc}
    {points}
    series={texSeries}
    class={className}
    height={height}
  />
{/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--py-muted-foreground, CanvasText);
  }
</style>

