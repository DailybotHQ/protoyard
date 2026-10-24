<script lang="ts">
import { calendarLayout } from '@texuli/charts/math';
/** Adapter: Protoyard CalendarHeatmap → Texuli HeatmapChart via calendarLayout. */
import { HeatmapChart } from '@texuli/charts/matrix';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  title: string;
  description?: string;
  values?: Readonly<Record<string, number>>;
  emptyMessage?: string;
  [key: string]: unknown;
};

let { title, description, values = {}, emptyMessage }: Props = $props();
const desc = $derived(description ?? emptyMessage ?? title);
const cells = $derived.by(() => {
  const days = Object.keys(values).sort();
  if (days.length === 0) return [] as { x: string; y: string; value: number }[];
  const layout = calendarLayout({ start: days[0]!, end: days[days.length - 1]! }, { values });
  return layout.cells
    .filter((c) => c.value !== null)
    .map((c) => ({
      x: `W${c.week}`,
      y: String(c.weekday),
      value: c.value as number,
    }));
});
</script>

<ChartRoot title={title}>
{#if cells.length === 0}
  <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
{:else}
  <HeatmapChart {title} description={desc} {cells} />
{/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--py-muted-foreground, CanvasText);
  }
</style>

