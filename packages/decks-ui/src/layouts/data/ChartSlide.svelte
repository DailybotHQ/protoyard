<script lang="ts">
import type { ChartLayoutPropsSchema } from '@protoyard/decks/layouts';
import Blocks from '../design/Blocks.svelte';
import { fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';
import { getPropSteps } from '../prop-steps.ts';

/**
 * A chart on a card. The data table stays behind the chart's own "View as
 * table" toggle on screen (so it never overflows the stage, whatever
 * `showTable` asks for); a print-only copy of the table goes on paper.
 */
let { props: p }: { props: PropsOf<typeof ChartLayoutPropsSchema> } = $props();
const steps = getPropSteps();
const series = $derived(p.spec.series);
</script>

<SlideFrame layout="chart" class="gap-[2.4cqw] px-[7cqw] py-[5cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col justify-center">
    <div {...steps(['spec'])} class="rounded-[1.8cqw] border border-border bg-card px-[2.6cqw] py-[2cqw] text-card-foreground shadow-soft" data-slot="chart">
      <Blocks blocks={[{ type: 'chart', spec: p.spec, height: p.height ?? 'lg', showTable: false }]} />
    </div>
  </div>
  <table class="w-full border-collapse text-left text-[18px]" data-slot="print-table">
    <caption class="text-left font-semibold">{p.spec.title}</caption>
    <thead>
      <tr>
        <th scope="col">Label</th>
        {#each series as s, i (i)}<th scope="col">{s.label}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each p.spec.labels as label, j (j)}
        <tr>
          <th scope="row">{label}</th>
          {#each series as s, i (i)}<td>{s.values[j] ?? '—'}</td>{/each}
        </tr>
      {/each}
    </tbody>
  </table>
</SlideFrame>
