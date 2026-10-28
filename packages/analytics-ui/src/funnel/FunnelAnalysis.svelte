<script lang="ts">
import type { FunnelResult, FunnelStepResult } from '@protoyard/analytics/funnel';
import { FunnelChart } from '@protoyard/charts-ui/part-whole';
import { Toggle } from 'texuli/toggle';
import { formatCount } from '../cohort/model.ts';
import { formatConversion, formatDuration, funnelSeries } from './model.ts';

type Props = {
  title: string;
  result: FunnelResult;
  /** Selected breakdown value; null shows every user (bind it to keep it in the route). */
  selected?: string | null;
  onselectedchange?: (key: string | null) => void;
  /** Name of the breakdown property, for the selector label (`Plan`). */
  breakdownLabel?: string;
  orientation?: 'vertical' | 'horizontal';
  loading?: boolean;
  /** A funnel step was chosen in the chart (e.g. to drill into its users). */
  onstepselect?: (step: FunnelStepResult, index: number) => void;
};

let {
  title,
  result,
  selected = $bindable(null),
  onselectedchange,
  breakdownLabel = 'Breakdown',
  orientation = 'vertical',
  loading = false,
  onstepselect,
}: Props = $props();

const uid = $props.id();
const series = $derived(funnelSeries(result));
// A value that left the result (new filters) falls back to everyone.
const current = $derived(
  series.find((s) => s.key === selected) ?? (series[0] as (typeof series)[number])
);
const last = $derived(current.steps.at(-1));
const choose = (key: string | null) => {
  selected = key;
  onselectedchange?.(key);
};
</script>

<section class="grid gap-3" aria-labelledby="{uid}-title">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 id="{uid}-title" class="text-sm font-semibold">{title}</h3>
    {#if series.length > 1}
      <div role="group" aria-label={breakdownLabel} class="flex flex-wrap gap-1 text-xs">
        {#each series as s (s.key ?? '')}
          <Toggle
            pressed={s.key === current.key}
            class="rounded-md border px-2 py-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {s.key ===
            current.key
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-foreground hover:bg-muted'}"
            onclick={() => choose(s.key)}
          >
            {s.label}
            <span class="opacity-80">· {formatConversion(s.steps.at(-1)?.conversion ?? null)}</span>
          </Toggle>
        {/each}
      </div>
    {/if}
  </div>
  <FunnelChart
    title={current.key === null ? title : `${title}: ${current.label}`}
    steps={current.steps.map((s) => ({ id: s.id, label: s.label, count: s.count }))}
    {orientation}
    {loading}
    onselect={onstepselect
      ? (_step, index) => onstepselect?.(current.steps[index] as FunnelStepResult, index)
      : undefined}
  />
  <div class="overflow-x-auto">
    <table class="w-full text-xs tabular-nums" data-series={current.key ?? 'all'}>
      <caption class="sr-only">
        {title} steps for {current.label}: {formatConversion(last?.conversion ?? null)} reached {last?.label ?? 'the end'}.
      </caption>
      <thead class="text-muted-foreground">
        <tr class="border-b border-border">
          <th scope="col" class="px-2 py-1.5 text-left font-medium">Step</th>
          <th scope="col" class="px-2 py-1.5 text-right font-medium">Users</th>
          <th scope="col" class="px-2 py-1.5 text-right font-medium">Overall</th>
          <th scope="col" class="px-2 py-1.5 text-right font-medium">From previous</th>
          <th scope="col" class="px-2 py-1.5 text-right font-medium">Drop-off</th>
          <th scope="col" class="px-2 py-1.5 text-right font-medium">Median time to convert</th>
        </tr>
      </thead>
      <tbody>
        {#each current.steps as step, i (step.id)}
          <tr class="border-b border-border last:border-0" data-step={step.id}>
            <th scope="row" class="px-2 py-1.5 text-left font-medium">{i + 1}. {step.label}</th>
            <td class="px-2 py-1.5 text-right">{formatCount(step.count)}</td>
            <td class="px-2 py-1.5 text-right">{formatConversion(step.conversion)}</td>
            <td class="px-2 py-1.5 text-right">{i === 0 ? '—' : formatConversion(step.stepConversion)}</td>
            <td class="px-2 py-1.5 text-right">{i === 0 ? '—' : formatCount(step.dropOff)}</td>
            <td class="px-2 py-1.5 text-right">{formatDuration(step.medianTimeToConvert)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
