<script lang="ts">
import {
  type Comparison,
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  type Granularity,
  PRESET_LABELS,
  resolveDateRange,
} from '@protoyard/analytics';
import { Button } from '@protoyard/ui';
import MonthGrid from './MonthGrid.svelte';
import {
  allowedGranularities,
  COMPARISON_LABELS,
  type DateRangeChange,
  type DateRangeValue,
  describeDateRange,
  fitGranularity,
  formatSpan,
  GRANULARITY_LABELS,
  isoDay,
} from './model.ts';

type Props = {
  value: DateRangeValue;
  /** "Now" from the simulated clock (epoch ms): presets resolve against it, later days are disabled. */
  now: number;
  onchange: (value: DateRangeValue, change: DateRangeChange) => void;
  presets?: readonly DateRangePreset[];
  weekStartsOn?: number;
};

let { value, now, onchange, presets = DATE_RANGE_PRESETS, weekStartsOn = 1 }: Props = $props();

const details = $derived(describeDateRange(value, now));
const allowed = $derived(allowedGranularities(details.range));
let draftStart = $state<string | null>(null);
let draftEnd = $state<string | null>(null);

const draft = $derived(
  draftStart && draftEnd
    ? {
        kind: 'custom' as const,
        start: draftStart < draftEnd ? draftStart : draftEnd,
        end: draftStart < draftEnd ? draftEnd : draftStart,
      }
    : null
);

function emitRange(range: DateRangeValue['range']) {
  const resolved = resolveDateRange(range, now);
  onchange({ ...value, range, granularity: fitGranularity(value.granularity, resolved) }, 'range');
}

function pick(day: string) {
  if (!draftStart || draftEnd) {
    draftStart = day;
    draftEnd = null;
  } else draftEnd = day;
}

function apply() {
  if (!draft) return;
  emitRange(draft);
  draftStart = null;
  draftEnd = null;
}

const comparisons: Comparison[] = ['none', 'previous-period', 'previous-year'];
const granularities: Granularity[] = ['hour', 'day', 'week', 'month'];
const segment =
  'rounded-md px-2.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 not-aria-pressed:hover:bg-muted';
</script>

<div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
  <div role="group" aria-label="Preset ranges" class="grid content-start gap-0.5">
    {#each presets as preset (preset)}
      {@const active = value.range.kind === 'preset' && value.range.preset === preset}
      <button
        type="button"
        aria-pressed={active}
        class="rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-muted'}"
        onclick={() => emitRange({ kind: 'preset', preset })}
      >
        {PRESET_LABELS[preset]}
      </button>
    {/each}
  </div>

  <div class="grid content-start gap-3">
    <div role="group" aria-label="Custom range" class="grid gap-2">
      <MonthGrid
        start={draftStart ?? (value.range.kind === 'custom' ? value.range.start : null)}
        end={draftStart ? draftEnd : value.range.kind === 'custom' ? value.range.end : null}
        initial={isoDay(Math.max(details.range.start, details.range.end - 1))}
        max={now}
        {weekStartsOn}
        onpick={pick}
      />
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-muted-foreground" aria-live="polite">
          {#if draft}{formatSpan(resolveDateRange(draft, now))}{:else if draftStart}Pick an end day{:else}Pick a start day{/if}
        </p>
        <Button size="sm" disabled={!draft} onclick={apply}>Apply range</Button>
      </div>
    </div>

    <div role="group" aria-label="Compare to" class="flex flex-wrap items-center gap-1">
      <span class="mr-1 text-xs text-muted-foreground" aria-hidden="true">Compare</span>
      {#each comparisons as comparison (comparison)}
        <button
          type="button"
          class={segment}
          aria-pressed={value.comparison === comparison}
          onclick={() => onchange({ ...value, comparison }, 'comparison')}>{COMPARISON_LABELS[comparison]}</button
        >
      {/each}
    </div>

    <div role="group" aria-label="Group by" class="flex flex-wrap items-center gap-1">
      <span class="mr-1 text-xs text-muted-foreground" aria-hidden="true">Group by</span>
      {#each granularities as granularity (granularity)}
        {@const ok = allowed.includes(granularity)}
        <button
          type="button"
          class={segment}
          aria-pressed={value.granularity === granularity}
          disabled={!ok}
          title={ok ? undefined : `Not available for ${details.span}`}
          onclick={() => onchange({ ...value, granularity }, 'granularity')}>{GRANULARITY_LABELS[granularity]}</button
        >
      {/each}
    </div>

    <p class="text-xs text-muted-foreground" data-range-summary="">
      {details.span}{#if details.comparedSpan}
        · compared with {details.comparedSpan}{/if}
    </p>
  </div>
</div>
