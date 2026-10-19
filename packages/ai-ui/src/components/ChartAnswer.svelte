<script lang="ts">
import { parseChartSpec } from '@protoyard/ai/chart';

/*
 * A ```chart fence from a simulated answer, loaded on demand by RichAnswer.
 * The fence text is validated (JSON.parse + zod); a valid spec shows as a
 * table at once and as a `@protoyard/charts-ui` chart when that chunk
 * arrives, an invalid one shows a short note and the raw text. Spec strings
 * only ever render as text.
 */
let { text }: { text: string } = $props();

const result = $derived(parseChartSpec(text));
const spec = $derived(result.ok ? result.spec : null);
const cartesian = $derived(spec !== null && ['line', 'area', 'bar'].includes(spec.kind));
const units = $derived(
  spec ? { unit: spec.unit ?? 'number', currency: spec.currency ?? 'USD' } : null
);
const valueFormat = $derived.by(() => {
  if (!spec) return (v: number) => String(v);
  const unit = spec.unit ?? 'number';
  const format =
    unit === 'cents'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: spec.currency ?? 'USD' })
      : unit === 'percent'
        ? new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
        : new Intl.NumberFormat('en-US', unit === 'compact' ? { notation: 'compact' } : {});
  return (v: number) => format.format(unit === 'cents' ? v / 100 : v);
});
const series = $derived(
  spec
    ? spec.series.map((s, i) => ({
        id: `s${i}`,
        label: s.label,
        points: spec.labels.map((x, j) => ({ x, y: s.values[j] ?? null })),
      }))
    : []
);
const items = $derived(
  spec
    ? spec.labels.map((label, i) => ({ id: `i${i}`, label, value: spec.series[0]?.values[i] ?? 0 }))
    : []
);
const load = () =>
  cartesian ? import('@protoyard/charts-ui/cartesian') : import('@protoyard/charts-ui/part-whole');
</script>

{#snippet table()}
  {#if spec}
    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full border-collapse text-left text-xs tabular-nums">
        <caption class="px-3 py-2 text-left font-semibold">{spec.title}</caption>
        <thead class="bg-muted/70">
          <tr>
            <th scope="col" class="border-b border-border px-3 py-2 font-semibold">Label</th>
            {#each spec.series as s, i (i)}<th scope="col" class="border-b border-border px-3 py-2 text-right font-semibold">{s.label}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each spec.labels as label, j (j)}
            <tr class="border-b border-border last:border-0">
              <th scope="row" class="px-3 py-1.5 font-medium">{label}</th>
              {#each spec.series as s, i (i)}
                {@const v = s.values[j] ?? null}
                <td class="px-3 py-1.5 text-right">{v === null ? '—' : valueFormat(v)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

{#if !result.ok}
  <div role="note" class="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs" data-chart-error>
    <p class="font-medium">This chart could not be shown.</p>
    <p class="mt-1 text-muted-foreground">{result.error}</p>
    <details class="mt-2">
      <summary class="cursor-pointer text-muted-foreground">Show the chart data</summary>
      <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono">{text}</pre>
    </details>
  </div>
{:else if spec && units}
  <figure class="m-0" data-chart-kind={spec.kind}>
    {#await load()}
      {@render table()}
    {:then kit}
      {#if 'BarChart' in kit && spec.kind === 'bar'}
        <kit.BarChart title={spec.title} description={spec.description} {series} {...units} height={220} />
      {:else if 'LineChart' in kit && (spec.kind === 'line' || spec.kind === 'area')}
        <kit.LineChart title={spec.title} description={spec.description} {series} {...units} area={spec.kind === 'area'} height={220} />
      {:else if 'FunnelChart' in kit && spec.kind === 'funnel'}
        <kit.FunnelChart title={spec.title} description={spec.description} steps={items.map((d) => ({ id: d.id, label: d.label, count: d.value }))} unit={units.unit} height={220} />
      {:else if 'PieChart' in kit && spec.kind === 'pie'}
        <kit.PieChart title={spec.title} description={spec.description} data={items} {...units} height={220} />
      {:else if 'DonutChart' in kit}
        <kit.DonutChart title={spec.title} description={spec.description} data={items} {...units} height={220} />
      {/if}
    {:catch}
      {@render table()}
      <p role="note" class="mt-1 text-xs text-muted-foreground">The chart view did not load; the table shows the same data.</p>
    {/await}
  </figure>
{/if}
