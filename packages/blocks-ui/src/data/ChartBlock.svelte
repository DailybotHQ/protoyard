<script lang="ts">
import { type ChartBlock as ChartBlockData, ChartSpecSchema } from '@protoyard/blocks';
import {
  chartItems,
  chartSeries,
  chartValueFormatter,
  chartXKind,
  isCartesianChart,
} from './format.ts';

/**
 * A chart block on `@protoyard/charts-ui`. The spec is the AI chart spec
 * (`ChartSpecSchema`), checked again here: an invalid one shows a short note
 * instead of a chart. A valid one shows its data table at once, then the chart
 * when the cartesian or part-whole chunk arrives. Every charts-ui chart has its
 * own "View as table" toggle, so the block adds none; `showTable` keeps the
 * data table under the chart. Charts draw with the theme's `--py-chart1..8`
 * palette, so they follow every theme.
 */
let { block }: { block: ChartBlockData } = $props();

const HEIGHTS = { sm: 160, md: 220, lg: 300 } as const;
const parsed = $derived(ChartSpecSchema.safeParse(block.spec));
const spec = $derived(parsed.success ? parsed.data : null);
const problem = $derived(
  parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid chart')
);
const format = $derived(spec ? chartValueFormatter(spec) : (value: number) => String(value));
const units = $derived(
  spec ? { unit: spec.unit ?? 'number', currency: spec.currency ?? 'USD' } : null
);
const height = $derived(HEIGHTS[block.height ?? 'md']);
const load = (kind: string) =>
  isCartesianChart(kind as never)
    ? import('@protoyard/charts-ui/cartesian')
    : import('@protoyard/charts-ui/part-whole');
</script>

{#snippet table()}
  {#if spec}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be keyboard reachable (WCAG 2.1.1). -->
    <div class="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring" role="region" aria-label={`${spec.title} (table)`} tabindex="0">
      <table class="w-full border-collapse text-left text-sm tabular-nums">
        <caption class="px-3 py-2 text-left font-semibold">{spec.title}</caption>
        <thead class="bg-muted/70">
          <tr>
            <th scope="col" class="border-b border-border px-3 py-2 font-semibold">Label</th>
            {#each spec.series as series, i (i)}<th scope="col" class="border-b border-border px-3 py-2 text-right font-semibold">{series.label}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each spec.labels as label, j (j)}
            <tr class="border-b border-border last:border-0">
              <th scope="row" class="px-3 py-1.5 font-medium">{label}</th>
              {#each spec.series as series, i (i)}
                {@const value = series.values[j] ?? null}
                <td class="px-3 py-1.5 text-right">{value === null ? '—' : format(value)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

{#if !spec}
  <div role="note" class="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm" data-chart-error data-py-block="chart">
    <p class="font-medium">This chart could not be shown.</p>
    <p class="mt-1 text-muted-foreground">{problem}</p>
  </div>
{:else if units}
  <figure class="m-0 grid gap-2" data-py-block="chart" data-chart-kind={spec.kind}>
    {#await load(spec.kind)}
      <!-- The data is readable at once; the chart takes its place when it loads. -->
      {@render table()}
    {:then kit}
      <div>
        {#if 'BarChart' in kit && spec.kind === 'bar'}
          <kit.BarChart title={spec.title} description={spec.description} series={chartSeries(spec)} {...units} {height} />
        {:else if 'LineChart' in kit && (spec.kind === 'line' || spec.kind === 'area')}
          <kit.LineChart title={spec.title} description={spec.description} series={chartSeries(spec)} xKind={chartXKind(spec)} {...units} area={spec.kind === 'area'} {height} />
        {:else if 'FunnelChart' in kit && spec.kind === 'funnel'}
          <kit.FunnelChart title={spec.title} description={spec.description} steps={chartItems(spec).map((d) => ({ id: d.id, label: d.label, count: d.value }))} unit={units.unit} {height} />
        {:else if 'PieChart' in kit && spec.kind === 'pie'}
          <kit.PieChart title={spec.title} description={spec.description} data={chartItems(spec)} {...units} {height} />
        {:else if 'DonutChart' in kit}
          <kit.DonutChart title={spec.title} description={spec.description} data={chartItems(spec)} {...units} {height} />
        {/if}
      </div>
      {#if block.showTable === true}{@render table()}{/if}
    {:catch}
      {@render table()}
      <p role="note" class="text-xs text-muted-foreground">The chart view did not load; the table shows the same data.</p>
    {/await}
  </figure>
{/if}
