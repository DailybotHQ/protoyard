<script lang="ts">
import type { CanvasRendererMode } from '@texuli/charts/canvas';
/** Adapter: Protoyard BarChart → Texuli BarChart; maps onselect to include datum. */
import { StackedBarChart, BarChart as TexuliBar } from '@texuli/charts/cartesian';
import ChartRoot from '../compat/ChartRoot.svelte';
import { type CartesianSeries, toTexuliSeries } from '../compat/series.ts';

type Props = {
  title: string;
  description?: string;
  series: readonly CartesianSeries[];
  emptyMessage?: string;
  mode?: 'grouped' | 'stacked' | 'expanded';
  class?: string;
  onselect?: (selection: {
    seriesId: string;
    index: number;
    x: number | string;
    y: number | null;
    datum?: unknown;
  }) => void;
  /** When false, skip Texuli interaction chunk (static marks). Default true for table toggle. */
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
  mode = 'grouped',
  class: className,
  onselect,
  interactive = true,
  renderer = 'auto',
}: Props = $props();

const desc = $derived(description ?? emptyMessage ?? `${title}.`);
const mapped = $derived(toTexuliSeries(series));
const empty = $derived(mapped.every((s) => s.points.length === 0));

function handleSelect(sel: {
  seriesId: string;
  index: number;
  x: number | string;
  y: number | null;
}) {
  if (!onselect) return;
  const source = series.find((s) => s.id === sel.seriesId);
  const point = source?.points[sel.index];
  onselect({ ...sel, datum: point?.datum });
}
</script>

<ChartRoot {title}>
  {#if empty}
    <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
  {:else if mode === 'stacked' || mode === 'expanded'}
    <StackedBarChart
      {title}
      description={desc}
      series={mapped}
      class={className}
      {interactive}
      {renderer}
      onselect={handleSelect}
    />
  {:else}
    <TexuliBar
      {title}
      description={desc}
      series={mapped}
      class={className}
      {interactive}
      {renderer}
      onselect={handleSelect}
    />
  {/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--tx-muted-foreground, CanvasText);
  }
</style>
