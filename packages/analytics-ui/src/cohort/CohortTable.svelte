<script lang="ts">
import type { RetentionResult } from '@protoyard/analytics/cohort';
import { rampScale } from '@protoyard/charts-ui/matrix';
import { untrack } from 'svelte';
import {
  type CohortDisplay,
  type CohortPalette,
  cohortLabel,
  formatCount,
  formatRate,
  periodLabel,
  readSequentialRamp,
} from './model.ts';

type Props = {
  title: string;
  result: RetentionResult;
  /** Shown value; the toggle changes it (bind it to keep it in the route). */
  display?: CohortDisplay;
  ondisplaychange?: (display: CohortDisplay) => void;
  /** Ramp hexes for the text-contrast check; default: read from the theme's `--py-seq-*`. */
  palette?: CohortPalette | null;
  description?: string;
};

let {
  title,
  result,
  display = $bindable('percent'),
  ondisplaychange,
  palette,
  description,
}: Props = $props();

const uid = $props.id();
let root = $state<HTMLElement | null>(null);
let themed = $state<CohortPalette | null>(null);

$effect(() => {
  const el = root;
  if (!el || palette !== undefined) return;
  // Re-read on theme or mode changes (the renderer writes them on <html>).
  return untrack(() => {
    themed = readSequentialRamp(el);
    if (typeof MutationObserver !== 'function') return undefined;
    const observer = new MutationObserver(() => {
      themed = readSequentialRamp(el);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-py-theme', 'data-py-mode', 'class', 'style'],
    });
    return () => observer.disconnect();
  });
});

const periods = $derived(result.average.length);
// Period 0 is always 100%: the ramp spans the later periods so their differences show.
const ramp = $derived(
  rampScale(
    result.cohorts.flatMap((c) =>
      c.cells.filter((cell) => cell.period > 0).map((cell) => cell.rate)
    ),
    palette === undefined ? themed : palette,
    { min: 0 }
  )
);
const setDisplay = (next: CohortDisplay) => {
  display = next;
  ondisplaychange?.(next);
};
const show = (rate: number | null, value: number | null) =>
  display === 'percent' ? formatRate(rate) : formatCount(value);
</script>

<section bind:this={root} class="grid gap-2" aria-labelledby="{uid}-title">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 id="{uid}-title" class="text-sm font-semibold">{title}</h3>
    <div role="group" aria-label="Show values as" class="inline-flex rounded-md border border-border p-0.5 text-xs">
      {#each [['percent', '%'], ['count', 'Count']] as const as [value, text] (value)}
        <button
          type="button"
          aria-pressed={display === value}
          class="rounded px-2 py-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {display ===
          value
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-muted'}"
          onclick={() => setDisplay(value)}>{text}</button
        >
      {/each}
    </div>
  </div>
  {#if description}<p class="text-xs text-muted-foreground">{description}</p>{/if}
  {#if result.cohorts.length === 0}
    <p class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      No cohorts in this period
    </p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full border-separate border-spacing-0.5 text-xs tabular-nums" data-display={display}>
        <caption class="sr-only">
          {title}: {result.mode === 'unbounded' ? 'share not yet churned' : 'share active'} per {result.interval}
          after joining, {display === 'percent' ? 'as a percentage of the cohort' : 'as a user count'}.
          Cells marked with an asterisk are incomplete.
        </caption>
        <thead>
          <tr>
            <th scope="col" class="px-2 py-1 text-left font-medium text-muted-foreground">Cohort</th>
            <th scope="col" class="px-2 py-1 text-right font-medium text-muted-foreground">Users</th>
            {#each { length: periods } as _, p (p)}
              <th scope="col" class="px-2 py-1 text-right font-medium text-muted-foreground"
                >{periodLabel(result.interval, p)}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each result.cohorts as cohort (cohort.start)}
            <tr>
              <th scope="row" class="px-2 py-1 text-left font-medium whitespace-nowrap"
                >{cohortLabel(result.interval, cohort.start)}</th
              >
              <td class="px-2 py-1 text-right">{formatCount(cohort.size)}</td>
              {#each cohort.cells as cell (cell.period)}
                {@const text = cell.period > 0 ? ramp.text(cell.rate) : null}
                <td
                  data-period={cell.period}
                  data-incomplete={cell.incomplete || undefined}
                  class="rounded-sm px-2 py-1 text-right {cell.incomplete ? 'outline-1 outline-border outline-dashed' : ''}"
                  style:background={cell.period > 0 ? ramp.fill(cell.rate) : undefined}
                >
                  <!-- Text sits on the fill only when it reaches 4.5:1; otherwise a surface chip keeps it readable. -->
                  <span
                    class={text || cell.rate === null || cell.period === 0
                      ? ''
                      : 'rounded-sm bg-surface/90 px-1 text-foreground'}
                    style:color={text}
                    >{show(cell.rate, cell.count)}{#if cell.incomplete && cell.rate !== null}<span aria-hidden="true"
                        >*</span
                      ><span class="sr-only"> (incomplete)</span>{/if}</span
                  >
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="px-2 py-1 text-left font-medium">Average</th>
            <td class="px-2 py-1 text-right text-muted-foreground">
              {formatCount(result.cohorts.reduce((n, c) => n + c.size, 0))}
            </td>
            {#each result.average as rate, p (p)}
              <td class="px-2 py-1 text-right font-medium" data-average={p}>{formatRate(rate)}</td>
            {/each}
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}
</section>
