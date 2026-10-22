<script lang="ts">
import type { CalculatorBlock as CalculatorBlockType } from '@protoyard/blocks';
import {
  calculatorChart,
  calculatorOutputs,
  calculatorValues,
} from '@protoyard/blocks/interactive';
import { Button } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import { formatUnitValue } from './format.ts';
import { useBlockState } from './use-block-state.svelte.ts';

let { block }: { block: CalculatorBlockType } = $props();
const ctl = useBlockState(() => block);
const values = $derived(calculatorValues(block, ctl.state));
const outputs = $derived(calculatorOutputs(block, ctl.state));
const chart = $derived(calculatorChart(block, ctl.state));
const currency = $derived(block.currency ?? 'USD');

function setInput(name: string, raw: string | number) {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return Promise.resolve(null);
  return ctl.dispatch({ type: 'set', name, value });
}
</script>

<section
  class="grid gap-4 rounded-lg border border-border bg-card p-4"
  data-py-block="calculator"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
  aria-labelledby="calc-title-{block.id}"
>
  {#if block.title}
    <h3 class="text-base font-semibold text-foreground" id="calc-title-{block.id}">
      {block.title}
    </h3>
  {/if}
  {#if block.description}
    <p class="text-sm text-muted-foreground">{block.description}</p>
  {/if}

  <div class="grid gap-3 sm:grid-cols-2">
    {#each block.inputs as input (input.name)}
      {@const current = values[input.name] ?? input.default}
      {@const control = input.control ?? 'slider'}
      {@const valueText = formatUnitValue(current, input.unit, currency)}
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium text-foreground">
          {input.label}
          <span class="font-normal text-muted-foreground">({valueText})</span>
        </span>
        {#if control === 'number'}
          <input
            type="number"
            class="rounded-md border border-border bg-background px-2 py-1.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            min={input.min}
            max={input.max}
            step={input.step ?? 'any'}
            value={current}
            disabled={ctl.pending}
            aria-label={input.label}
            aria-valuetext={valueText}
            onchange={(e) => setInput(input.name, (e.currentTarget as HTMLInputElement).value)}
          />
        {:else}
          <input
            type="range"
            class="w-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            min={input.min}
            max={input.max}
            step={input.step ?? (input.max - input.min) / 100}
            value={current}
            disabled={ctl.pending}
            aria-label={input.label}
            aria-valuemin={input.min}
            aria-valuemax={input.max}
            aria-valuenow={current}
            aria-valuetext={valueText}
            oninput={(e) => setInput(input.name, (e.currentTarget as HTMLInputElement).value)}
          />
        {/if}
        {#if input.help}
          <span class="text-xs text-muted-foreground">{input.help}</span>
        {/if}
      </label>
    {/each}
  </div>

  <div class="grid gap-2 sm:grid-cols-2" aria-live="polite">
    {#each outputs as output (output.id)}
      {@const out = block.outputs.find((o) => o.id === output.id)}
      <div
        class="rounded-md border border-border p-3
          {out?.emphasis ? 'bg-primary/5 ring-1 ring-primary/30' : 'bg-muted/30'}"
      >
        <p class="text-xs text-muted-foreground">{output.label}</p>
        <p class="text-lg font-semibold tabular-nums text-foreground">
          {output.value === null
            ? '—'
            : formatUnitValue(output.value, out?.unit, currency)}
        </p>
      </div>
    {/each}
  </div>

  {#if chart}
    {@const series = [
      {
        id: 'y',
        label: block.outputs.find((o) => o.id === block.chart?.output)?.label ?? 'Output',
        points: chart.x.map((x, i) => ({ x, y: chart.y[i] ?? null })),
      },
    ]}
    {#await import('@protoyard/charts-ui/cartesian') then mod}
      <mod.LineChart
        title={block.chart?.output ?? 'Projection'}
        {series}
        height={180}
        showLegend={false}
        emptyMessage="No chart data"
      />
    {/await}
  {/if}

  <Button
    size="sm"
    variant="outline"
    class="w-fit"
    loading={ctl.pending}
    onclick={() => ctl.dispatch({ type: 'reset' })}
  >
    Reset inputs
  </Button>
  {#if ctl.error}
    <p class="text-sm text-destructive" role="alert">{ctl.error}</p>
  {/if}
</section>
