<script lang="ts">
import type { ChartControlsBlock as ChartControlsBlockType } from '@protoyard/blocks';
import { chartControlsSpec } from '@protoyard/blocks/interactive';
import { Button } from '@protoyard/ui';
import { isSecurityFuzzHost } from '../host.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import { useBlockState } from './use-block-state.svelte.ts';

let { block }: { block: ChartControlsBlockType } = $props();
const ctl = useBlockState(() => block);
const spec = $derived(chartControlsSpec(block, ctl.state));
const height = $derived(block.height === 'sm' ? 160 : block.height === 'lg' ? 280 : 220);
const fuzzStub = $derived(isSecurityFuzzHost());

const series = $derived(
  spec.series.map((row, index) => ({
    id: `s${index}`,
    label: row.label,
    points: spec.labels.map((label, i) => ({
      x: label,
      y: row.values[i] ?? null,
    })),
  }))
);

const donutData = $derived(
  spec.labels.map((label, i) => ({
    id: `slice-${i}`,
    label,
    value: spec.series[0]?.values[i] ?? 0,
  }))
);

const partWhole = $derived(spec.kind === 'donut' || spec.kind === 'pie' || spec.kind === 'funnel');

function seriesVisible(index: number): boolean {
  return !ctl.state.hidden.includes(index);
}

function setSeriesVisible(index: number, checked: boolean) {
  const visible = seriesVisible(index);
  if (checked === visible) return;
  void ctl.dispatch({ type: 'toggle-series', index });
}
</script>

<section
  class="grid gap-3 rounded-lg border border-border bg-card p-4"
  data-py-block="chart-controls"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
>
  <div class="flex flex-wrap items-center gap-2">
    {#if block.kinds}
      <div class="flex flex-wrap gap-1" role="group" aria-label="Chart kind">
        {#each block.kinds as kind (kind)}
          <Button
            size="sm"
            variant={ctl.state.kind === kind ? 'default' : 'outline'}
            loading={ctl.pending}
            aria-pressed={ctl.state.kind === kind}
            onclick={() => ctl.dispatch({ type: 'set-kind', kind })}
          >
            {kind}
          </Button>
        {/each}
      </div>
    {/if}
    <Button
      size="sm"
      variant="ghost"
      class="ml-auto"
      loading={ctl.pending}
      onclick={() => ctl.dispatch({ type: 'reset' })}
    >
      Reset chart
    </Button>
  </div>

  {#if block.seriesToggle}
    <div class="flex flex-wrap gap-3" role="group" aria-label="Series visibility">
      {#each block.spec.series as row, index (index)}
        {@const checked = seriesVisible(index)}
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="size-4 rounded border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {checked}
            disabled={ctl.pending}
            aria-label="Show {row.label}"
            onchange={(e) =>
              setSeriesVisible(index, (e.currentTarget as HTMLInputElement).checked)}
          />
          <span>{row.label}</span>
        </label>
      {/each}
    </div>
  {/if}

  {#if block.range && block.spec.labels.length >= 3}
    {@const max = block.spec.labels.length - 1}
    {@const range = ctl.state.range ?? [0, max]}
    <div class="grid gap-1 text-sm">
      <span class="font-medium text-foreground">Label range</span>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1">
          From
          <input
            type="number"
            class="w-16 rounded border border-border px-1 py-0.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            min={0}
            max={max - 1}
            value={range[0]}
            disabled={ctl.pending}
            aria-label="Label range start"
            onchange={(e) => {
              const start = Number((e.currentTarget as HTMLInputElement).value);
              const end = Math.max(start + 1, range[1]);
              void ctl.dispatch({ type: 'set-range', range: [start, Math.min(end, max)] });
            }}
          />
        </label>
        <label class="flex items-center gap-1">
          To
          <input
            type="number"
            class="w-16 rounded border border-border px-1 py-0.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            min={1}
            max={max}
            value={range[1]}
            disabled={ctl.pending}
            aria-label="Label range end"
            onchange={(e) => {
              const end = Number((e.currentTarget as HTMLInputElement).value);
              const start = Math.min(range[0], end - 1);
              void ctl.dispatch({
                type: 'set-range',
                range: [Math.max(0, start), end],
              });
            }}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          loading={ctl.pending}
          onclick={() => ctl.dispatch({ type: 'set-range', range: null })}
        >
          All labels
        </Button>
      </div>
    </div>
  {/if}

  {#if fuzzStub}
    <div data-py-chart="" role="img" aria-label={spec.title ?? 'Chart'}></div>
  {:else if partWhole}
    {#await import('@protoyard/charts-ui/part-whole') then mod}
      <mod.DonutChart title={spec.title ?? 'Chart'} data={donutData} height={height} />
    {/await}
  {:else}
    {#await import('@protoyard/charts-ui/cartesian') then mod}
      {#if spec.kind === 'bar'}
        <mod.BarChart title={spec.title ?? 'Chart'} {series} height={height} />
      {:else}
        <mod.LineChart
          title={spec.title ?? 'Chart'}
          {series}
          xKind="category"
          height={height}
          area={spec.kind === 'area'}
        />
      {/if}
    {/await}
  {/if}

  <div class="sr-only" aria-live="polite">Chart updated as {spec.kind}</div>
  {#if ctl.error}
    <p class="text-sm text-destructive" role="alert">{ctl.error}</p>
  {/if}
</section>
