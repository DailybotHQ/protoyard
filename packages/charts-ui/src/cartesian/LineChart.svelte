<script lang="ts">
import type { CanvasRendererMode } from '@texuli/charts/canvas';
/** Adapter: Protoyard LineChart → Texuli LineChart/AreaChart; forwards onselect. */
import { AreaChart, LineChart as TexuliLine } from '@texuli/charts/cartesian';
import ChartRoot from '../compat/ChartRoot.svelte';
import { type CartesianSeries, toTexuliSeries } from '../compat/series.ts';

type Props = {
  title: string;
  description?: string;
  series: readonly CartesianSeries[];
  emptyMessage?: string;
  area?: boolean;
  class?: string;
  onselect?: (selection: {
    seriesId: string;
    index: number;
    x: number | string;
    y: number | null;
  }) => void;
  interactive?: boolean;
  /** `auto` (default: canvas from 5,000 points), `svg` or `canvas`. */
  renderer?: CanvasRendererMode;
  [key: string]: unknown;
};

let {
  title,
  description,
  series,
  emptyMessage,
  area = false,
  class: className,
  onselect,
  interactive = true,
  renderer = 'auto',
}: Props = $props();

const desc = $derived(description ?? emptyMessage ?? `${title}.`);
const mapped = $derived(toTexuliSeries(series));
const empty = $derived(mapped.every((s) => s.points.length === 0));
</script>

<ChartRoot {title}>
  {#if empty}
    <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
  {:else if area}
    <AreaChart {title} description={desc} series={mapped} class={className} {interactive} {renderer} {onselect} />
  {:else}
    <TexuliLine {title} description={desc} series={mapped} class={className} {interactive} {renderer} {onselect} />
  {/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--tx-muted-foreground, CanvasText);
  }
</style>
